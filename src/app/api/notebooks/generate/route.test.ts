// Route-level coverage for the multi-source rewrite. See the flashcards
// route test for why only the edges are mocked: resolveSources, ownsUrl,
// allocateQuotas and verifyGrounding all run for real here.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/src/library/verifyAuth", () => ({ verifyRequestAuth: vi.fn() }));
vi.mock("@/src/library/ollamaClient", () => ({ resolveOllamaBaseUrl: vi.fn(async () => "http://ollama.test") }));
vi.mock("@/src/library/documentTextCache", () => ({ getDocumentText: vi.fn() }));
vi.mock("@/src/library/firebaseAdmin", () => ({ adminDb: { doc: () => ({ get: async () => ({ data: () => undefined }) }) } }));
vi.mock("@/src/library/ollamaEmbeddings", () => ({ embedTexts: vi.fn() }));
vi.mock("@/src/library/vectorStore", () => ({ searchChunks: vi.fn() }));
vi.mock("@/src/library/flashcardGeneration", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/library/flashcardGeneration")>()),
  generateFlashcardsWithRetry: vi.fn(),
}));
vi.mock("@/src/library/quizGeneration", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/library/quizGeneration")>()),
  generateQuizWithValidation: vi.fn(),
}));

import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { getDocumentText } from "@/src/library/documentTextCache";
import { generateFlashcardsWithRetry } from "@/src/library/flashcardGeneration";
import { generateQuizWithValidation } from "@/src/library/quizGeneration";
import { MAX_SOURCES } from "@/src/library/sources/resolveSources";
import { POST } from "./route";

const QUOTE = "A queue holds seventeen items";
const TEXT = `${QUOTE} and overflows with code ZEPHYR-47.`;
const TYPES = { multipleChoice: true, trueFalse: false, matching: false };

let uid = 0;
/** A fresh uid per request; this route allows only 6 per minute per user. */
function nextUid() {
  uid += 1;
  return `n${uid}`;
}

function post(body: unknown) {
  return POST({ json: async () => body } as unknown as NextRequest);
}

let batch = 0;
function items(count: number) {
  batch += 1;
  return Array.from({ length: count }, (_, i) => ({ n: `${batch}-${i}` }));
}

describe("POST /api/notebooks/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OLLAMA_PRIMARY_URL = "http://ollama.test";
    process.env.OLLAMA_AUTH_TOKEN = "token";
    vi.mocked(verifyRequestAuth).mockResolvedValue({ uid: nextUid() } as Awaited<
      ReturnType<typeof verifyRequestAuth>
    >);
    vi.mocked(getDocumentText).mockResolvedValue(TEXT);
    vi.mocked(generateFlashcardsWithRetry).mockImplementation(async (_t, _b, _m, _p, count = 10) => ({
      topicName: "Queues",
      questions: items(count).map(({ n }) => ({ question: `Q${n}`, answer: "A", sourceQuote: QUOTE })),
    }));
    vi.mocked(generateQuizWithValidation).mockImplementation(async (_t, count) => ({
      topicName: "Queues",
      questions: items(count).map(({ n }) => ({
        id: n,
        type: "multiple_choice" as const,
        question: `Q${n}`,
        options: ["a", "b"],
        correctAnswer: "a",
        sourceQuote: QUOTE,
      })),
    }));
  });

  function note(title: string) {
    return { title, text: TEXT };
  }

  it("generates flashcards from typed notes", async () => {
    const response = await post({ kind: "flashcards", sources: [note("One"), note("Two")] });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.questions).toHaveLength(20);
    expect(body.audit).toHaveLength(2);
    expect(generateQuizWithValidation).not.toHaveBeenCalled();
  });

  it("generates a quiz with the requested count and types", async () => {
    const response = await post({
      kind: "quiz",
      sources: [note("One"), note("Two")],
      questionCount: 10,
      questionTypes: TYPES,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.questions).toHaveLength(10);
    expect(generateFlashcardsWithRetry).not.toHaveBeenCalled();
    expect(vi.mocked(generateQuizWithValidation).mock.calls[0][2]).toEqual(TYPES);
  });

  it("rejects a body with no kind", async () => {
    const response = await post({ sources: [note("One")] });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("flashcards or a quiz");
  });

  it("rejects an empty notebook", async () => {
    const response = await post({ kind: "flashcards", sources: [] });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("no notes yet");
  });

  // The notebooks route's ceiling was 20 before this task.
  it.each([0, 51, 2.5])("rejects an out-of-range questionCount %s", async (questionCount) => {
    const response = await post({
      kind: "quiz",
      sources: [note("One")],
      questionCount,
      questionTypes: TYPES,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Question count must be between 1 and 50.");
  });

  it("accepts a quiz at the raised ceiling", async () => {
    const response = await post({
      kind: "quiz",
      sources: [note("One")],
      questionCount: 50,
      questionTypes: TYPES,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).questions).toHaveLength(50);
  });

  it("rejects a quiz with no question type", async () => {
    const response = await post({ kind: "quiz", sources: [note("One")], questionCount: 10, questionTypes: {} });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("at least one question type");
  });

  it("refuses a note file belonging to another user without failing the notebook", async () => {
    const response = await post({
      kind: "flashcards",
      sources: [note("Mine"), { title: "Theirs", url: "/api/download?key=users/someone-else/x.pdf", fileType: "pdf" }],
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.audit.map((a: { title: string }) => a.title)).toEqual(["Mine"]);
    expect(body.skipped).toEqual([{ title: "Theirs", reason: "not-owned" }]);
    expect(getDocumentText).not.toHaveBeenCalled();
  });

  // The ruling: a notebook the app let the student build must not be refused
  // for its size. The extras are reported instead.
  it("truncates an oversized notebook and reports the overflow", async () => {
    const sources = Array.from({ length: MAX_SOURCES + 3 }, (_, i) => note(`Note ${i}`));
    const response = await post({ kind: "flashcards", sources });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.audit).toHaveLength(MAX_SOURCES);
    expect(body.skipped).toEqual([
      { title: `Note ${MAX_SOURCES}`, reason: "over-source-limit" },
      { title: `Note ${MAX_SOURCES + 1}`, reason: "over-source-limit" },
      { title: `Note ${MAX_SOURCES + 2}`, reason: "over-source-limit" },
    ]);
  });

  // The degraded floor plus truncation together: ten notes and a 10-question
  // quiz was impossible before this round.
  it("generates a 10-question quiz from ten notes", async () => {
    const sources = Array.from({ length: 10 }, (_, i) => note(`Note ${i}`));
    const response = await post({ kind: "quiz", sources, questionCount: 10, questionTypes: TYPES });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.questions).toHaveLength(10);
    expect(body.audit.every((a: { requested: number }) => a.requested >= 1)).toBe(true);
  });

  // Review Focus (C1): the modal has no source picker - it says "uses all N
  // notes" and offers only a 5-20 count - so "pick fewer sources" is advice
  // the student cannot follow. Every count from 5 to 20 worked for every
  // notebook before the multi-source rewrite, and must still work.
  it.each([
    [6, 5],
    [10, 5],
    [10, 9],
  ])("generates from %i notes at a count of %i instead of refusing", async (noteCount, questionCount) => {
    const sources = Array.from({ length: noteCount }, (_, i) => note(`Note ${i}`));
    const response = await post({ kind: "quiz", sources, questionCount, questionTypes: TYPES });
    const body = await response.json();

    expect(response.status).toBe(200);
    // The count is raised to one question per note, never lowered.
    expect(body.questions).toHaveLength(noteCount);
    expect(body.audit).toHaveLength(noteCount);
    expect(body.audit.every((a: { requested: number }) => a.requested === 1)).toBe(true);
  });

  it("leaves a count that already covers every note alone", async () => {
    const sources = Array.from({ length: 4 }, (_, i) => note(`Note ${i}`));
    const response = await post({ kind: "quiz", sources, questionCount: 20, questionTypes: TYPES });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.questions).toHaveLength(20);
  });

  // Flashcards use a fixed count of 20, which already covers MAX_SOURCES
  // notes; this pins that so a later change to the default cannot
  // reintroduce the 400 unnoticed.
  it("generates flashcards from a full-size notebook", async () => {
    const sources = Array.from({ length: MAX_SOURCES }, (_, i) => note(`Note ${i}`));
    const response = await post({ kind: "flashcards", sources });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.audit).toHaveLength(MAX_SOURCES);
    expect(body.questions).toHaveLength(20);
  });

  // A note the student can see must never vanish: with no url and no text it
  // has to come back as a skip, not disappear.
  it("reports a note with nothing to read instead of dropping it", async () => {
    const response = await post({ kind: "flashcards", sources: [note("Real"), { title: "Hollow" }] });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.skipped).toEqual([{ title: "Hollow", reason: "no-text" }]);
  });

  // Note.fileType is optional, so a document note can arrive without one.
  it("reads a note file that carries no fileType", async () => {
    const auth = await verifyRequestAuth({} as NextRequest);
    const response = await post({
      kind: "flashcards",
      sources: [{ title: "Week 3.pptx", url: `/api/download?key=users/${auth!.uid}/w3.pptx` }],
    });

    expect(response.status).toBe(200);
    expect(getDocumentText).toHaveBeenCalledWith(expect.anything(), expect.any(String), "pptx");
  });

  it("answers 502 when nothing survives generation", async () => {
    vi.mocked(generateFlashcardsWithRetry).mockResolvedValue({ topicName: "Queues", questions: [] });

    const response = await post({ kind: "flashcards", sources: [note("One")] });

    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("unexpected response");
  });

  it("is unauthorized without a verified caller", async () => {
    vi.mocked(verifyRequestAuth).mockResolvedValue(null);

    expect((await post({})).status).toBe(401);
  });

  it("reports the assistant as unconfigured with no model url", async () => {
    delete process.env.OLLAMA_PRIMARY_URL;
    const response = await post({ kind: "flashcards", sources: [note("One")] });

    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain("not configured");
  });
});
