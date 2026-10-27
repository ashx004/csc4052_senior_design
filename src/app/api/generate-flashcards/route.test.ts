// Route-level coverage for the multi-source rewrite.
//
// Only the edges are mocked — auth, the model call, document reading, Qdrant
// and Firestore. resolveSources, resolveDepsFor, allocateQuotas and
// verifyGrounding all run for real, because the point of these tests is the
// wiring between them, and because this rewrite relocated the ownership check
// out of the route and into ownsUrl.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/src/library/verifyAuth", () => ({ verifyRequestAuth: vi.fn() }));
vi.mock("@/src/library/ollamaClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/library/ollamaClient")>()),
  resolveOllamaBaseUrl: vi.fn(async () => "http://ollama.test"),
}));
vi.mock("@/src/library/documentTextCache", () => ({ getDocumentText: vi.fn() }));
vi.mock("@/src/library/firebaseAdmin", () => ({ adminDb: { doc: () => ({ get: async () => ({ data: () => undefined }) }) } }));
vi.mock("@/src/library/ollamaEmbeddings", () => ({ embedTexts: vi.fn() }));
vi.mock("@/src/library/vectorStore", () => ({ searchChunks: vi.fn() }));
vi.mock("@/src/library/flashcardGeneration", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/library/flashcardGeneration")>()),
  generateFlashcardsWithRetry: vi.fn(),
}));

import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { getDocumentText } from "@/src/library/documentTextCache";
import { generateFlashcardsWithRetry } from "@/src/library/flashcardGeneration";
import { setUsageSink } from "@/src/library/ai/aiFetch";
import { POST } from "./route";

const TEXT = "A queue holds seventeen items and overflows with code ZEPHYR-47.";
const QUOTE = "A queue holds seventeen items";

let uid = 0;
/** A fresh uid per request, so the route's own rate limiter never interferes. */
function nextUid() {
  uid += 1;
  return `u${uid}`;
}

function post(body: unknown) {
  return POST({ json: async () => body } as unknown as NextRequest);
}

// Questions must be unique across sources or the orchestrator's cross-source
// duplicate check drops the second source's cards and the fixture, not the
// code, decides the result.
let batch = 0;
function cards(count: number) {
  batch += 1;
  return Array.from({ length: count }, (_, i) => ({
    question: `Q${batch}-${i}`,
    answer: `A${i}`,
    sourceQuote: QUOTE,
  }));
}

describe("POST /api/generate-flashcards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OLLAMA_PRIMARY_URL = "http://ollama.test";
    process.env.OLLAMA_AUTH_TOKEN = "token";
    const owner = nextUid();
    vi.mocked(verifyRequestAuth).mockResolvedValue({ uid: owner } as Awaited<ReturnType<typeof verifyRequestAuth>>);
    vi.mocked(getDocumentText).mockResolvedValue(TEXT);
    vi.mocked(generateFlashcardsWithRetry).mockImplementation(async (_t, _b, _m, _p, count = 10) => ({
      topicName: "Queues",
      questions: cards(count),
    }));
  });

  it("generates from the legacy docUrl shape", async () => {
    const auth = await verifyRequestAuth({} as NextRequest);
    const response = await post({
      docUrl: `/api/download?key=users/${auth!.uid}/lecture.pdf`,
      docName: "Lecture.pdf",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.questions).toHaveLength(20);
    expect(body.topicName).toBe("Queues");
    expect(body.audit).toHaveLength(1);
    expect(body.skipped).toEqual([]);
    // The default is 20 cards from one source, and the source's text is what
    // reaches the model.
    expect(generateFlashcardsWithRetry).toHaveBeenCalledWith(TEXT, "http://ollama.test", undefined, [], 20);
  });

  it("honors the percent-encoded form of an owned key", async () => {
    const auth = await verifyRequestAuth({} as NextRequest);
    const response = await post({
      docUrl: `/api/download?key=users%2F${auth!.uid}%2Flecture.pdf`,
      docName: "Lecture.pdf",
    });

    expect(response.status).toBe(200);
  });

  // The rewrite moved this check from the route into ownsUrl. It must still
  // refuse, and must not read the file.
  it("refuses a document belonging to another user", async () => {
    const response = await post({
      docUrl: "/api/download?key=users/someone-else/secret.pdf",
      docName: "secret.pdf",
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.skipped).toEqual([{ title: "secret.pdf", reason: "not-owned" }]);
    expect(getDocumentText).not.toHaveBeenCalled();
    expect(generateFlashcardsWithRetry).not.toHaveBeenCalled();
  });

  it("answers 502 when nothing survives generation", async () => {
    const auth = await verifyRequestAuth({} as NextRequest);
    vi.mocked(generateFlashcardsWithRetry).mockResolvedValue({ topicName: "Queues", questions: [] });

    const response = await post({ docUrl: `/api/download?key=users/${auth!.uid}/l.pdf`, docName: "l.pdf" });

    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("unexpected response");
  });

  // An ungrounded card is dropped by verifyGrounding, so a model that quotes
  // nothing real is indistinguishable from one that returns nothing.
  it("answers 502 when no card quotes its source", async () => {
    const auth = await verifyRequestAuth({} as NextRequest);
    vi.mocked(generateFlashcardsWithRetry).mockResolvedValue({
      topicName: "Queues",
      questions: [{ question: "Q", answer: "A", sourceQuote: "nothing like the document" }],
    });

    const response = await post({ docUrl: `/api/download?key=users/${auth!.uid}/l.pdf`, docName: "l.pdf" });

    expect(response.status).toBe(502);
  });

  it("rejects a body with no sources", async () => {
    const response = await post({});

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("at least one document");
  });

  it.each([0, 31, 2.5, "ten"])("rejects an out-of-range count %s", async (count) => {
    const auth = await verifyRequestAuth({} as NextRequest);
    const response = await post({ docUrl: `/api/download?key=users/${auth!.uid}/l.pdf`, docName: "l.pdf", count });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("between 1 and 30");
  });

  it("accepts the count boundaries", async () => {
    const auth = await verifyRequestAuth({} as NextRequest);
    const low = await post({ docUrl: `/api/download?key=users/${auth!.uid}/l.pdf`, docName: "l.pdf", count: 1 });
    expect(low.status).toBe(200);
    expect((await low.json()).questions).toHaveLength(1);

    const high = await post({ docUrl: `/api/download?key=users/${auth!.uid}/l.pdf`, docName: "l.pdf", count: 30 });
    expect(high.status).toBe(200);
    expect((await high.json()).questions).toHaveLength(30);
  });

  it("is unauthorized without a verified caller", async () => {
    vi.mocked(verifyRequestAuth).mockResolvedValue(null);

    expect((await post({})).status).toBe(401);
  });

  it("reports the assistant as unconfigured with no model url", async () => {
    delete process.env.OLLAMA_PRIMARY_URL;
    const response = await post({ docUrl: "/api/download?key=users/x/l.pdf", docName: "l.pdf" });

    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain("not configured");
  });

  it("spreads the count across several owned sources", async () => {
    const auth = await verifyRequestAuth({} as NextRequest);
    const response = await post({
      sources: [
        { title: "One", url: `/api/download?key=users/${auth!.uid}/a.pdf`, fileType: "pdf" },
        { title: "Two", url: `/api/download?key=users/${auth!.uid}/b.pdf`, fileType: "pdf" },
      ],
      count: 10,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.questions).toHaveLength(10);
    expect(body.audit.map((a: { title: string; requested: number }) => a.requested)).toEqual([5, 5]);
    expect(body.sourceKeys).toEqual([`users/${auth!.uid}/a.pdf`, `users/${auth!.uid}/b.pdf`]);
  });

  // The degraded floor: three sources and four cards must still generate.
  it("generates a count below the per-source floor", async () => {
    const auth = await verifyRequestAuth({} as NextRequest);
    const response = await post({
      sources: ["a", "b", "c"].map((n) => ({
        title: n,
        url: `/api/download?key=users/${auth!.uid}/${n}.pdf`,
        fileType: "pdf",
      })),
      count: 4,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.questions).toHaveLength(4);
  });

  it("rejects a count below one item per source with an actionable message", async () => {
    const auth = await verifyRequestAuth({} as NextRequest);
    const response = await post({
      sources: ["a", "b", "c"].map((n) => ({
        title: n,
        url: `/api/download?key=users/${auth!.uid}/${n}.pdf`,
        fileType: "pdf",
      })),
      count: 2,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("at least 3 items for 3 sources");
  });

  // Important 3: an unexpected failure must not be dressed up as a 400 with
  // internal text in it.
  it("keeps a document-read failure out of the client's error message", async () => {
    const auth = await verifyRequestAuth({} as NextRequest);
    vi.mocked(getDocumentText).mockRejectedValue(new Error("MinIO connection refused at 10.0.0.4:9000"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await post({ docUrl: `/api/download?key=users/${auth!.uid}/l.pdf`, docName: "l.pdf" });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(JSON.stringify(body)).not.toContain("MinIO");
    expect(body.skipped).toEqual([{ title: "l.pdf", reason: "unreadable" }]);
    // Important 4: the operator still gets the real reason.
    expect(errors.mock.calls.flat().join(" ")).toContain("MinIO connection refused");
    errors.mockRestore();
  });
});

// --- Both AI providers: the real generator runs, only the provider's HTTP reply is faked ---
const providerReply = (backend: "ollama" | "cloud", payload: unknown) =>
  backend === "cloud"
    ? Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(payload) } }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } })
    : Response.json({ done: true, done_reason: "stop", message: { role: "assistant", content: JSON.stringify(payload) } });

describe("POST /api/generate-flashcards on both AI providers", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setUsageSink(() => {});
    Object.assign(process.env, {
      AI_MODEL_DEFAULT: "openrouter:google/gemma-4-26b-a4b-it",
      AI_MODEL_GENERATION: "openrouter:qwen/qwen3.7-flash",
      AI_MODEL_OCR: "openrouter:z-ai/glm-5.3-flash",
      AI_MODEL_FALLBACK: "google:gemini-3.1-flash-lite",
      OPENROUTER_API_KEY: "or-key",
      GOOGLE_AI_API_KEY: "g-key",
      OLLAMA_AUTH_TOKEN: "token",
      OLLAMA_MODEL_MAIN: "test-main",
      OLLAMA_PRIMARY_URL: "http://ollama.test",
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); delete process.env.AI_BACKEND; });

  it.each(["ollama", "cloud"] as const)("returns schema-valid flashcards on %s", async (backend) => {
    if (backend === "cloud") process.env.AI_BACKEND = "cloud"; else delete process.env.AI_BACKEND;
    const real = await vi.importActual<typeof import("@/src/library/flashcardGeneration")>("@/src/library/flashcardGeneration");
    vi.mocked(generateFlashcardsWithRetry).mockImplementation(real.generateFlashcardsWithRetry);
    vi.mocked(verifyRequestAuth).mockResolvedValue({ uid: nextUid() } as Awaited<ReturnType<typeof verifyRequestAuth>>);
    vi.mocked(getDocumentText).mockResolvedValue(TEXT);
    const payload = {
      topicName: "Queues",
      questions: Array.from({ length: 20 }, (_, i) => ({ question: `Real question ${i}`, answer: `Answer ${i}`, sourceQuote: QUOTE })),
    };
    fetchMock.mockResolvedValue(providerReply(backend, payload));

    const auth = await verifyRequestAuth({} as NextRequest);
    const response = await post({ docUrl: `/api/download?key=users/${auth!.uid}/lecture.pdf`, docName: "Lecture.pdf" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(backend === "cloud" ? "openrouter.ai" : "ollama.test");
    expect(body.topicName).toBe("Queues");
    expect(body.questions).toHaveLength(20);
    for (const c of body.questions) {
      expect(c).toMatchObject({ question: expect.any(String), answer: expect.any(String), sourceQuote: QUOTE });
    }
  });
});
