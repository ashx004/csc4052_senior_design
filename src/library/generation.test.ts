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
    // JSON mode, not a JSON schema: schema + think:false crashes qwen3.6 (ollama/ollama#17434).
    expect(body(0).format).toBe("json");
    const content = body(0).messages[1].content as string;
    expect(content).toContain('"type": "multiple_choice"');
    expect(content).not.toContain('"true_false"');
  });
  it("retains valid questions and repairs only the missing count", async () => {
    request.mockResolvedValueOnce(reply([mc(1), { ...mc(2), correctAnswer: "absent" }, mc(1)]));
    request.mockResolvedValueOnce(reply([mc(2), mc(3)]));
    expect((await quiz()).questions.map((q) => q.question)).toEqual(["Question 1?", "Question 2?", "Question 3?"]);
    expect(body(1).messages[1].content).toContain("exactly 2 quiz questions");
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

describe("quiz levels and question quality", () => {
  const prompt = (n: number) => body(n).messages[1].content as string;
  const tf = { type: "true_false", question: "Is it true?", options: ["True", "False"], correctAnswer: "True" };

  it("plans one Bloom level per question (exam by default) and drops 'simple language'", async () => {
    request.mockResolvedValueOnce(reply([mc(1), mc(2), mc(3)]));
    await quiz();
    expect(prompt(0)).toContain("1. remember\n2. understand\n3. apply");
    expect(prompt(0)).not.toContain("Use simple language");
    expect(prompt(0)).toContain("Do not invent facts.");
    expect(prompt(0)).toContain("untrusted source material");
    expect(prompt(0)).toContain("never refer to options by letter or position");
  });
  it("uses the chosen level's plan", async () => {
    request.mockResolvedValueOnce(reply([mc(1), mc(2), mc(3)]));
    await generateQuizWithValidation("Source text", 3, { multipleChoice: true }, "http://ai", undefined, [], "challenge");
    expect(prompt(0)).toContain("1. apply\n2. analyze\n3. evaluate");
  });
  it("describes bloomLevel, concept and explanation in the JSON shape", async () => {
    request.mockResolvedValueOnce(reply([mc(1), mc(2), mc(3)]));
    await quiz();
    expect(body(0).format).toBe("json");
    expect(prompt(0)).toContain('"bloomLevel": "remember" | "understand" | "apply" | "analyze" | "evaluate"');
    expect(prompt(0)).toContain('"concept"');
    expect(prompt(0)).toContain('"explanation"');
    expect(prompt(0)).toContain("The questions array must contain exactly 3 items.");
  });
  it("keeps the new fields when the model returns them", async () => {
    const rich = { ...mc(1), bloomLevel: "apply", concept: "FIFO order", explanation: "Because queues are FIFO…" };
    request.mockResolvedValueOnce(reply([rich]));
    const [q] = (await quiz(1)).questions;
    expect(q).toMatchObject({ bloomLevel: "apply", concept: "FIFO order", explanation: "Because queues are FIFO…" });
  });
  it("normalizes bloomLevel case and spacing", async () => {
    request.mockResolvedValueOnce(reply([{ ...mc(1), bloomLevel: " Apply " }]));
    const [q] = (await quiz(1)).questions;
    expect(q.bloomLevel).toBe("apply");
  });
  it("keeps a question whose bloomLevel is not a known level, without the level", async () => {
    request.mockResolvedValueOnce(reply([{ ...mc(1), bloomLevel: "create" }]));
    const [q] = (await quiz(1)).questions;
    expect(q.question).toBe("Question 1?");
    expect(q.bloomLevel).toBeUndefined();
  });
  it("still drops malformed questions now that no schema grammar enforces the shape", async () => {
    const extra = { ...mc(4), options: ["A", "B", "C"] };
    request.mockResolvedValueOnce(reply([mc(1), mc(2), mc(3), extra]));
    const result = await quiz();
    expect(result.questions.map((q) => q.question)).toEqual(["Question 1?", "Question 2?", "Question 3?"]);
  });
  it("shuffles multiple-choice options but keeps the correct answer", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    request.mockResolvedValueOnce(reply([mc(1)]));
    const [q] = (await quiz(1)).questions;
    expect(q.options).not.toEqual(["A", "B", "C", "D"]);
    expect([...q.options].sort()).toEqual(["A", "B", "C", "D"]);
    expect(q.options).toContain(q.correctAnswer);
  });
  it("never reorders true/false options", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    request.mockResolvedValueOnce(reply([tf]));
    const [q] = (await generateQuizWithValidation("Source text", 1, { trueFalse: true }, "http://ai", undefined)).questions;
    expect(q.options).toEqual(["True", "False"]);
  });
  it("marks matching questions as remember and keeps their concept", async () => {
    const match = { type: "matching", question: "Queue", options: [], correctAnswer: "FIFO list", bloomLevel: "analyze", concept: "queues", explanation: "" };
    request.mockResolvedValueOnce(reply([match]));
    const [q] = (await generateQuizWithValidation("Source", 1, { matching: true }, "http://ai", undefined)).questions;
    expect(q.bloomLevel).toBe("remember");
    expect(q.concept).toBe("queues");
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
