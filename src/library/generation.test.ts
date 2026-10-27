import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateQuizWithValidation } from "./quizGeneration";
import { buildBloomPlan } from "./quizDifficulty";
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
    // JSON mode is kept because it is tested working; re-test a schema `format` before switching back.
    expect(body(0).format).toBe("json");
    const content = body(0).messages[1].content as string;
    expect(content).toContain('"type": "multiple_choice"');
    expect(content).not.toContain('"true_false"');
  });
  it("asks for spares in the same call and returns them, so a quote check later needs no second round", async () => {
    request.mockResolvedValueOnce(reply([mc(1), mc(2), mc(3), mc(4)]));
    const result = await generateQuizWithValidation("Source text", 3, { multipleChoice: true }, "http://ai", undefined, [], undefined, { spares: 1 });
    expect(result.questions).toHaveLength(4);
    expect(request).toHaveBeenCalledTimes(1);
    expect(body(0).messages[1].content).toContain("exactly 4 quiz questions");
  });
  it("doesn't spend a repair call on missing spares once the quiz itself is full", async () => {
    request.mockResolvedValueOnce(reply([mc(1), mc(2), mc(3)]));
    const result = await generateQuizWithValidation("Source text", 3, { multipleChoice: true }, "http://ai", undefined, [], undefined, { spares: 2 });
    expect(result.questions).toHaveLength(3);
    expect(request).toHaveBeenCalledTimes(1);
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
  it.each([0, 51, 2.5, NaN])("rejects invalid count %s before inference", async (n) => {
    await expect(quiz(n)).rejects.toThrow("Choose"); expect(request).not.toHaveBeenCalled();
  });
  it("regenerating a quiz above twenty questions asks for at least the needed count and does not throw", async () => {
    request.mockResolvedValueOnce(reply(Array.from({ length: 43 }, (_, i) => mc(i + 1))));
    const result = await generateQuizWithValidation("Source text", 40, { multipleChoice: true }, "http://ai", undefined, ["Old question about something else entirely?"]);
    expect(result.questions).toHaveLength(40);
    const asked = Number(/must contain exactly (\d+) items/.exec(body(0).messages[1].content)?.[1]);
    expect(asked).toBeGreaterThanOrEqual(40);
  });
  it("accepts a count above the old twenty-question ceiling", async () => {
    request.mockResolvedValueOnce(reply(Array.from({ length: 30 }, (_, i) => mc(i + 1))));
    expect((await quiz(30)).questions).toHaveLength(30);
  });

  it.each([51, 0, 2.5])("still rejects an out-of-range quiz count %s", async (n) => {
    await expect(quiz(n)).rejects.toThrow("Choose");
    expect(request).not.toHaveBeenCalled();
  });
});

describe("quiz focus", () => {
  const focus = { quotas: [{ conceptKey: "chain rule", label: "Chain Rule", items: 3 }], avoid: ["Old question about something else entirely?"] };
  it("sends the focus fragment and merges focus.avoid into the avoid list", async () => {
    request.mockResolvedValueOnce(reply([mc(1), mc(2), mc(3)]));
    await generateQuizWithValidation("Source text", 3, { multipleChoice: true }, "http://ai", undefined, [], undefined, {}, focus);
    const content = body(0).messages[1].content as string;
    expect(content).toContain("Chain Rule");
    expect(content).toContain('conceptKey: "chain rule"');
    expect(content).toContain("Old question about something else entirely?");
  });
  it("drops a question that repeats one supplied only through focus.avoid", async () => {
    request.mockResolvedValueOnce(reply([{ ...mc(1), question: "Old question about something else entirely?" }, mc(2), mc(3), mc(4)]));
    const result = await generateQuizWithValidation("Source text", 3, { multipleChoice: true }, "http://ai", undefined, [], undefined, {}, focus);
    expect(result.questions.map((q) => q.question)).not.toContain("Old question about something else entirely?");
  });
  it("keeps conceptKey from the model", async () => {
    request.mockResolvedValueOnce(reply([{ ...mc(1), conceptKey: "chain rule" }, mc(2), mc(3)]));
    const result = await generateQuizWithValidation("Source text", 3, { multipleChoice: true }, "http://ai", undefined, [], undefined, {}, focus);
    expect(result.questions.find((q) => q.question === "Question 1?")).toMatchObject({ conceptKey: "chain rule" });
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
  it("keeps the other questions when one item is malformed (missing options, bad type)", async () => {
    const { options: _omit, ...noOptions } = mc(2);
    request.mockResolvedValueOnce(reply([mc(1), noOptions, { ...mc(3), type: "multiple choice" }, mc(4)]));
    const result = await quiz(2);
    expect(result.questions.map((q) => q.question)).toEqual(["Question 1?", "Question 4?"]);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("New questions keeps the intended level mix: the first N plan lines equal buildBloomPlan(d, N)", async () => {
    request.mockResolvedValue(reply([]));
    await expect(generateQuizWithValidation("Source text", 10, { multipleChoice: true }, "http://ai", undefined, ["Old question about something else entirely?"], "challenge")).rejects.toThrow();
    const lines = [...prompt(0).matchAll(/^(\d+)\. (\w+)$/gm)].map((m) => m[2]);
    expect(lines.length).toBe(13);
    expect(lines.slice(0, 10)).toEqual(buildBloomPlan("challenge", 10));
    expect(lines.slice(0, 10)).toContain("evaluate");
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
  it("honors a custom count instead of always ten", async () => {
    request.mockResolvedValueOnce(reply(cards(3)));
    const result = await generateFlashcardsWithRetry("Source text", "http://ai", undefined, [], 3);
    expect(result.questions).toHaveLength(3);
    expect(request).toHaveBeenCalledTimes(1);
    expect(body(0).messages[1].content).toContain("exactly 3 flashcards");
  });

  it("generates more than ten cards when asked", async () => {
    request.mockResolvedValueOnce(reply(cards(25)));
    const result = await generateFlashcardsWithRetry("Source text", "http://ai", undefined, [], 25);
    expect(result.questions).toHaveLength(25);
  });

  it("repairs only the shortfall against the custom count", async () => {
    request.mockResolvedValueOnce(reply(cards(2)));
    request.mockResolvedValueOnce(reply(cards(3, 2)));
    const result = await generateFlashcardsWithRetry("Source text", "http://ai", undefined, [], 5);
    expect(result.questions).toHaveLength(5);
    expect(body(1).messages[1].content).toContain("exactly 3 flashcards");
  });

  it("names the custom count in the failure message", async () => {
    request.mockImplementation(async () => reply([]));
    await expect(generateFlashcardsWithRetry("Source text", "http://ai", undefined, [], 7)).rejects.toThrow(
      "7 valid, distinct flashcards"
    );
  });

  it("still defaults to ten for callers that pass no count", async () => {
    request.mockResolvedValueOnce(reply(cards(10)));
    expect((await flash()).questions).toHaveLength(10);
  });

  it.each([0, 31, 2.5, NaN])("rejects an out-of-range flashcard count %s before inference", async (n) => {
    await expect(generateFlashcardsWithRetry("Source text", "http://ai", undefined, [], n)).rejects.toThrow("Choose");
    expect(request).not.toHaveBeenCalled();
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

describe("grounding evidence in generated items", () => {
  it("asks flashcards for a verbatim quote and keeps it", async () => {
    request.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              topicName: "Topic",
              questions: [{ question: "Q?", answer: "A", sourceQuote: "verbatim evidence here" }],
            }),
          },
        })
      )
    );
    const result = await generateFlashcardsWithRetry("Source text", "http://ai", undefined, [], 1);
    expect(result.questions[0].sourceQuote).toBe("verbatim evidence here");
    expect(body(0).messages[1].content).toContain("sourceQuote");
  });

  it("keeps a flashcard whose quote is missing rather than failing the batch", async () => {
    request.mockResolvedValueOnce(reply(cards(1)));
    const result = await generateFlashcardsWithRetry("Source text", "http://ai", undefined, [], 1);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].sourceQuote).toBeUndefined();
  });

  it("truncates an over-length flashcard quote instead of failing the batch", async () => {
    request.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: { content: JSON.stringify({ topicName: "Topic", questions: [{ question: "Q?", answer: "A", sourceQuote: "x".repeat(600) }] }) } }))
    );
    const result = await generateFlashcardsWithRetry("Source text", "http://ai", undefined, [], 1);
    expect(result.questions[0].sourceQuote).toBe("x".repeat(500));
  });

  it.each([null, 42, ["a"], "   "])("degrades a bad flashcard quote %j to undefined without failing the batch", async (bad) => {
    request.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: { content: JSON.stringify({ topicName: "Topic", questions: [{ question: "Q?", answer: "A", sourceQuote: bad }] }) } }))
    );
    const result = await generateFlashcardsWithRetry("Source text", "http://ai", undefined, [], 1);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].sourceQuote).toBeUndefined();
  });

  it("asks the quiz prompt for evidence and bans trick options", async () => {
    request.mockResolvedValueOnce(reply([mc(1), mc(2), mc(3)]));
    await quiz();
    const prompt = body(0).messages[1].content as string;
    expect(prompt).toContain("sourceQuote");
    expect(prompt).toContain("all of the above");
    expect(prompt).toContain("plausible");
  });

  it("carries a quiz question's quote through validation", async () => {
    request.mockResolvedValueOnce(reply([{ ...mc(1), sourceQuote: "quoted from the source" }]));
    const result = await quiz(1);
    expect(result.questions[0].sourceQuote).toBe("quoted from the source");
  });
});
