// Route-level coverage for the multi-source rewrite. See the flashcards
// route test for why only the edges are mocked: resolveSources, ownsUrl,
// allocateQuotas and verifyGrounding all run for real here.

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
vi.mock("@/src/library/quizGeneration", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/library/quizGeneration")>()),
  generateQuizWithValidation: vi.fn(),
}));

import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { getDocumentText } from "@/src/library/documentTextCache";
import { generateQuizWithValidation } from "@/src/library/quizGeneration";
import { setUsageSink } from "@/src/library/ai/aiFetch";
import { POST } from "./route";

const TEXT = "A queue holds seventeen items and overflows with code ZEPHYR-47.";
const QUOTE = "A queue holds seventeen items";
const TYPES = { multipleChoice: true, trueFalse: false, matching: false };

let uid = 0;
/** A fresh uid per request, so the route's own rate limiter never interferes. */
function nextUid() {
  uid += 1;
  return `q${uid}`;
}

function post(body: unknown) {
  return POST({ json: async () => body } as unknown as NextRequest);
}

// Unique across sources, or the orchestrator's duplicate check would decide
// the result instead of the route.
let batch = 0;
function questions(count: number) {
  batch += 1;
  return Array.from({ length: count }, (_, i) => ({
    id: `${batch}-${i}`,
    type: "multiple_choice" as const,
    question: `Q${batch}-${i}`,
    options: ["a", "b"],
    correctAnswer: "a",
    sourceQuote: QUOTE,
  }));
}

describe("POST /api/generate-quiz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OLLAMA_PRIMARY_URL = "http://ollama.test";
    vi.mocked(verifyRequestAuth).mockResolvedValue({ uid: nextUid() } as Awaited<
      ReturnType<typeof verifyRequestAuth>
    >);
    vi.mocked(getDocumentText).mockResolvedValue(TEXT);
    vi.mocked(generateQuizWithValidation).mockImplementation(async (_t, count) => ({
      topicName: "Queues",
      questions: questions(count),
    }));
  });

  /** The legacy body every current caller sends. */
  function legacy(ownerUid: string, overrides: Record<string, unknown> = {}) {
    return {
      docUrl: `/api/download?key=users/${ownerUid}/lecture.pdf`,
      docName: "Lecture.pdf",
      questionCount: 10,
      questionTypes: TYPES,
      ...overrides,
    };
  }

  it("generates from the legacy docUrl shape", async () => {
    const auth = await verifyRequestAuth({} as NextRequest);
    const response = await post(legacy(auth!.uid));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.questions).toHaveLength(10);
    expect(body.topicName).toBe("Queues");
    expect(body.difficulty).toBeTruthy();
    expect(body.audit).toHaveLength(1);
    expect(generateQuizWithValidation).toHaveBeenCalledWith(
      TEXT,
      10,
      TYPES,
      "http://ollama.test",
      undefined,
      [],
      body.difficulty,
      { spares: 3 }
    );
  });

  it("passes avoidQuestions through to the generator", async () => {
    const auth = await verifyRequestAuth({} as NextRequest);
    await post(legacy(auth!.uid, { avoidQuestions: ["old one", "  ", 7] }));

    expect(vi.mocked(generateQuizWithValidation).mock.calls[0][5]).toEqual(["old one"]);
  });

  // The rewrite moved this check from the route into ownsUrl. It must still
  // refuse, and must not read the file.
  it("refuses a document belonging to another user", async () => {
    const response = await post(legacy("someone-else"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.skipped).toEqual([{ title: "Lecture.pdf", reason: "not-owned" }]);
    expect(getDocumentText).not.toHaveBeenCalled();
    expect(generateQuizWithValidation).not.toHaveBeenCalled();
  });

  it("answers 502 when nothing survives generation", async () => {
    const auth = await verifyRequestAuth({} as NextRequest);
    vi.mocked(generateQuizWithValidation).mockResolvedValue({ topicName: "Queues", questions: [] });

    const response = await post(legacy(auth!.uid));

    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("unexpected response");
  });

  it("rejects a body with no sources", async () => {
    expect((await post({ questionCount: 10, questionTypes: TYPES })).status).toBe(400);
  });

  it("rejects a body with no question type", async () => {
    const auth = await verifyRequestAuth({} as NextRequest);
    const response = await post(legacy(auth!.uid, { questionTypes: {} }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("at least one question type");
  });

  // Task 4 raised the library ceiling to 50; closing the route's own stale
  // limit of 20 was part of this task.
  it.each([0, -1, 51, 2.5, "ten", undefined])("rejects an out-of-range questionCount %s", async (questionCount) => {
    const auth = await verifyRequestAuth({} as NextRequest);
    const response = await post(legacy(auth!.uid, { questionCount }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Question count must be between 1 and 50.");
  });

  it("accepts the count boundaries, including the raised ceiling", async () => {
    const auth = await verifyRequestAuth({} as NextRequest);
    const low = await post(legacy(auth!.uid, { questionCount: 1 }));
    expect(low.status).toBe(200);
    expect((await low.json()).questions).toHaveLength(1);

    const high = await post(legacy(auth!.uid, { questionCount: 50 }));
    expect(high.status).toBe(200);
    expect((await high.json()).questions).toHaveLength(50);
  });

  it("is unauthorized without a verified caller", async () => {
    vi.mocked(verifyRequestAuth).mockResolvedValue(null);

    expect((await post({})).status).toBe(401);
  });

  it("keeps source order across several sources and reports their keys", async () => {
    const auth = await verifyRequestAuth({} as NextRequest);
    const response = await post({
      sources: [
        { title: "One", url: `/api/download?key=users/${auth!.uid}/a.pdf`, fileType: "pdf" },
        { title: "Two", url: `/api/download?key=users/${auth!.uid}/b.pdf`, fileType: "pdf" },
      ],
      questionCount: 10,
      questionTypes: TYPES,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.audit.map((a: { title: string }) => a.title)).toEqual(["One", "Two"]);
    expect(body.sourceKeys).toEqual([`users/${auth!.uid}/a.pdf`, `users/${auth!.uid}/b.pdf`]);
    // shuffle is false for quizzes: the first source's questions come first.
    const firstBatch = body.questions[0].question.split("-")[0];
    expect(body.questions[body.questions.length - 1].question.startsWith(firstBatch)).toBe(false);
  });

  // The degraded floor: a 3-question quiz was impossible before this round.
  it("generates a 3-question quiz from one source", async () => {
    const auth = await verifyRequestAuth({} as NextRequest);
    const response = await post(legacy(auth!.uid, { questionCount: 3 }));

    expect(response.status).toBe(200);
    expect((await response.json()).questions).toHaveLength(3);
  });

  it("keeps a document-read failure out of the client's error message", async () => {
    const auth = await verifyRequestAuth({} as NextRequest);
    vi.mocked(getDocumentText).mockRejectedValue(new Error("MinIO connection refused at 10.0.0.4:9000"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await post(legacy(auth!.uid));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(JSON.stringify(body)).not.toContain("MinIO");
    expect(errors.mock.calls.flat().join(" ")).toContain("MinIO connection refused");
    errors.mockRestore();
  });
});

// --- Both AI providers: the real generator runs, only the provider's HTTP reply is faked ---
const providerReply = (backend: "ollama" | "cloud", payload: unknown) =>
  backend === "cloud"
    ? Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(payload) } }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } })
    : Response.json({ done: true, done_reason: "stop", message: { role: "assistant", content: JSON.stringify(payload) } });

describe("POST /api/generate-quiz on both AI providers", () => {
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

  it.each(["ollama", "cloud"] as const)("returns schema-valid questions on %s", async (backend) => {
    if (backend === "cloud") process.env.AI_BACKEND = "cloud"; else delete process.env.AI_BACKEND;
    const real = await vi.importActual<typeof import("@/src/library/quizGeneration")>("@/src/library/quizGeneration");
    vi.mocked(generateQuizWithValidation).mockImplementation(real.generateQuizWithValidation);
    vi.mocked(verifyRequestAuth).mockResolvedValue({ uid: nextUid() } as Awaited<ReturnType<typeof verifyRequestAuth>>);
    vi.mocked(getDocumentText).mockResolvedValue(TEXT);
    const payload = {
      topicName: "Queues",
      questions: Array.from({ length: 13 }, (_, i) => ({
        type: "multiple_choice", question: `Real question ${i}`, options: ["a", "b", "c", "d"],
        correctAnswer: "a", sourceQuote: QUOTE,
      })),
    };
    fetchMock.mockResolvedValue(providerReply(backend, payload));

    const auth = await verifyRequestAuth({} as NextRequest);
    const response = await post({ docUrl: `/api/download?key=users/${auth!.uid}/lecture.pdf`, docName: "Lecture.pdf", questionCount: 10, questionTypes: TYPES });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(backend === "cloud" ? "openrouter.ai" : "ollama.test");
    expect(body.topicName).toBe("Queues");
    expect(body.questions).toHaveLength(10);
    for (const q of body.questions) {
      expect(q).toMatchObject({ id: expect.any(String), type: "multiple_choice", question: expect.any(String), options: expect.any(Array), correctAnswer: "a" });
    }
  });
});
