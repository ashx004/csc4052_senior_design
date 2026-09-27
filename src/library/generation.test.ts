import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateQuizWithValidation } from "./quizGeneration";
import { generateFlashcardsWithRetry } from "./flashcardGeneration";
import { structuredGeneration, normalizedQuestion } from "./structuredGeneration";

const request = vi.fn();
const mc = (n: number) => ({ type: "multiple_choice", question: `Question ${n}?`, options: ["A", "B", "C", "D"], correctAnswer: "B" });
const cards = (n = 10, offset = 0) => Array.from({ length: n }, (_, i) => ({ question: `Card ${i + offset}?`, answer: `Answer ${i + offset}` }));
const reply = (questions: unknown[], extra = {}) => new Response(JSON.stringify({ message: { content: JSON.stringify({ topicName: "Test topic", questions }) }, ...extra }));
const quiz = (n = 3, types = { multipleChoice: true }) => generateQuizWithValidation("Source text", n, types, "http://ai", undefined);
const flash = (previous?: string[]) => generateFlashcardsWithRetry("Source text", "http://ai", undefined, previous);
const body = (n: number) => JSON.parse(request.mock.calls[n][1].body);

beforeEach(() => {
  vi.stubGlobal("fetch", request); request.mockReset();
  vi.stubEnv("OLLAMA_MODEL_MAIN", "resident-model"); vi.stubEnv("OLLAMA_MAIN_NUM_CTX", "32768");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("quiz generation contract", () => {
  it("uses one call, the resident model and unchanged context for valid output", async () => {
    request.mockResolvedValueOnce(reply([mc(1), mc(2), mc(3)]));
    expect((await quiz()).questions).toHaveLength(3);
    expect(request).toHaveBeenCalledTimes(1);
    expect(body(0)).toMatchObject({ model: "resident-model", options: { num_ctx: 32768, temperature: 0 }, think: false });
    expect(body(0).format.properties.questions.items.properties.type.enum).toEqual(["multiple_choice"]);
  });
  it("retains valid questions and repairs only the missing count", async () => {
    request.mockResolvedValueOnce(reply([mc(1), { ...mc(2), correctAnswer: "absent" }, mc(1)]));
    request.mockResolvedValueOnce(reply([mc(2), mc(3)]));
    expect((await quiz()).questions.map((q) => q.question)).toEqual(["Question 1?", "Question 2?", "Question 3?"]);
    expect(body(1).format.properties.questions.minItems).toBe(2);
  });
  it("rejects a type the student did not request", async () => {
    const tf = { type: "true_false", question: "True?", options: ["True", "False"], correctAnswer: "True" };
    request.mockImplementation(async () => reply([tf]));
    await expect(quiz(1)).rejects.toThrow("Could not generate");
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each([
    { ...mc(1), question: " " },
    { ...mc(1), options: ["A", "B", "B", "D"] },
    { ...mc(1), options: ["A", "B"] },
    { type: "true_false", question: "True?", options: ["Yes", "No"], correctAnswer: "Yes" },
  ])("does not save invalid questions: %j", async (q) => {
    request.mockImplementation(async () => reply([q]));
    await expect(quiz(1)).rejects.toThrow("Could not generate");
  });
  it("builds matching pools across the repair with unique IDs", async () => {
    const match = (n: number) => ({ type: "matching", question: `Term ${n}`, options: [], correctAnswer: `Definition ${n}` });
    request.mockResolvedValueOnce(reply([match(1), match(1), match(2)]));
    request.mockResolvedValueOnce(reply([match(3)]));
    const result = await generateQuizWithValidation("Source", 3, { matching: true }, "http://ai", undefined);
    expect(new Set(result.questions.map((q) => q.id)).size).toBe(3);
    expect(new Set(result.questions.map((q) => q.matchingGroupId)).size).toBe(1);
    for (const q of result.questions) expect(q.options).toContain(q.correctAnswer);
  });
  it.each([0, 21, 2.5, NaN])("rejects invalid count %s before inference", async (n) => {
    await expect(quiz(n)).rejects.toThrow("Choose"); expect(request).not.toHaveBeenCalled();
  });
});

describe("flashcards", () => {
  it("uses one call for ten valid cards", async () => {
    request.mockResolvedValueOnce(reply(cards())); expect((await flash()).questions).toHaveLength(10);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("repairs missing cards without repeating retained or previous questions", async () => {
    request.mockResolvedValueOnce(reply([...cards(5), ...cards(5)]));
    request.mockResolvedValueOnce(reply(cards(6, 5)));
    const result = await flash(["Card 0?"]);
    expect(result.questions).toHaveLength(10);
    expect(new Set(result.questions.map((q) => q.question)).size).toBe(10);
    expect(body(1).format.properties.questions.minItems).toBe(6);
  });
  it.each([{ questions: [] }, { questions: [{ question: "", answer: "" }] }, { questions: cards(1) }])("rejects incomplete output after at most two attempts", async ({ questions }) => {
    request.mockImplementation(async () => reply(questions)); await expect(flash()).rejects.toThrow("Could not generate");
    expect(request).toHaveBeenCalledTimes(2);
  });
});

describe("bounded inference and transport", () => {
  it.each([429, 500, 503])("does not retry HTTP %s on a busy/broken service", async (status) => {
    request.mockResolvedValueOnce(new Response("unavailable", { status }));
    await expect(quiz()).rejects.toThrow(`HTTP ${status}`); expect(request).toHaveBeenCalledTimes(1);
  });
  it("does not retry timeouts", async () => {
    request.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    await expect(flash()).rejects.toThrow("timed out"); expect(request).toHaveBeenCalledTimes(1);
  });
  it("repairs malformed JSON once", async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ message: { content: "{" } })));
    request.mockResolvedValueOnce(reply([mc(1)])); expect((await quiz(1)).questions).toHaveLength(1);
  });
  it("does not accept a truncated generation even if its JSON parses", async () => {
    request.mockImplementation(async () => reply([mc(1)], { done_reason: "length" }));
    await expect(quiz(1)).rejects.toThrow("Could not generate");
  });
  it("does not start a request after its deadline", async () => {
    await expect(structuredGeneration({ baseUrl: "http://ai", feature: "quiz", schema: {}, messages: [], deadline: Date.now() - 1 })).rejects.toThrow("timed out");
    expect(request).not.toHaveBeenCalled();
  });
  it("preserves distinct code operators when comparing questions", () => {
    expect(normalizedQuestion("What is C++?")).not.toBe(normalizedQuestion("What is C#?"));
    expect(normalizedQuestion("x++")).not.toBe(normalizedQuestion("x--"));
  });
});
