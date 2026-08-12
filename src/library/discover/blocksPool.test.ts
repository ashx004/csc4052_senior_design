import { describe, expect, it, vi } from "vitest";
import type { BlocksSingleQuestion } from "./blocksTypes";

interface RawFlashcardTestShape {
  question: string;
  answer: string;
}

// blocksPool.ts imports @/src/library/firebase at module scope, which calls
// getAuth() at import time — mocked so this module can be imported without a
// live Firebase config. Matches src/library/chatMemory.test.ts.
vi.mock("@/src/library/firebase", () => ({ db: {} }));

const { extractSingleQuestions, extractMatchingQuestions, sampleFlashcardsAsMatching, sampleCardsForGeneration, needsTopUp, pickNextQuestion } =
  await import("./blocksPool");

describe("extractSingleQuestions", () => {
  it("maps multiple_choice and true_false questions, tagging source course/set", () => {
    const result = extractSingleQuestions(
      [
        { id: "q1", type: "multiple_choice", question: "2+2?", options: ["3", "4"], correctAnswer: "4" },
        { id: "q2", type: "true_false", question: "Sky is blue.", options: ["True", "False"], correctAnswer: "True" },
      ],
      "CSC 101 — Intro",
      "Chapter 1"
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      kind: "single",
      type: "multiple_choice",
      question: "2+2?",
      correctAnswer: "4",
      sourceCourse: "CSC 101 — Intro",
      sourceSet: "Chapter 1",
    });
  });

  it("skips matching questions and incomplete entries", () => {
    const result = extractSingleQuestions(
      [
        { id: "q1", type: "matching", question: "term", options: ["def"], correctAnswer: "def", matchingGroupId: "g1" },
        { id: "q2", type: "multiple_choice", question: "", options: ["a"], correctAnswer: "a" }, // no question text
        { id: "q3", type: "multiple_choice", question: "ok?", options: [], correctAnswer: "a" }, // no options
        { id: "q4", type: "multiple_choice", question: "ok?", options: ["a"], correctAnswer: "" }, // no correctAnswer
      ],
      "CSC 101",
      "Set"
    );
    expect(result).toHaveLength(0);
  });

  it("defaults explanation to an empty string when absent", () => {
    const [result] = extractSingleQuestions(
      [{ id: "q1", type: "true_false", question: "T?", options: ["True", "False"], correctAnswer: "True" }],
      "CSC 101",
      "Set"
    );
    expect(result.explanation).toBe("");
  });
});

describe("extractMatchingQuestions", () => {
  const threeGroup: any[] = [
    { id: "a1", type: "matching", question: "Term A", options: ["Def A", "Def B", "Def C"], correctAnswer: "Def A", matchingGroupId: "g1" },
    { id: "a2", type: "matching", question: "Term B", options: ["Def A", "Def B", "Def C"], correctAnswer: "Def B", matchingGroupId: "g1" },
    { id: "a3", type: "matching", question: "Term C", options: ["Def A", "Def B", "Def C"], correctAnswer: "Def C", matchingGroupId: "g1" },
  ];

  it("groups matching questions by matchingGroupId into one BlocksMatchingQuestion when the group has >= 3 pairs", () => {
    const result = extractMatchingQuestions(threeGroup, "CSC 101", "Vocab Set");
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("matching");
    expect(result[0].pairs).toEqual([
      { id: "a1", term: "Term A", definition: "Def A" },
      { id: "a2", term: "Term B", definition: "Def B" },
      { id: "a3", term: "Term C", definition: "Def C" },
    ]);
  });

  it("drops groups smaller than 3 pairs", () => {
    const twoOnly = threeGroup.slice(0, 2);
    expect(extractMatchingQuestions(twoOnly, "CSC 101", "Vocab Set")).toHaveLength(0);
  });

  it("ignores non-matching questions and matching questions without a matchingGroupId", () => {
    const mixed = [
      ...threeGroup,
      { id: "b1", type: "multiple_choice", question: "Q", options: ["A"], correctAnswer: "A" },
      { id: "b2", type: "matching", question: "Orphan", options: ["X"], correctAnswer: "X" },
    ];
    const result = extractMatchingQuestions(mixed, "CSC 101", "Vocab Set");
    expect(result).toHaveLength(1); // still just the g1 group
  });
});

describe("sampleFlashcardsAsMatching", () => {
  const sixCards: RawFlashcardTestShape[] = Array.from({ length: 6 }, (_, i) => ({
    question: `Term ${i}`,
    answer: `Definition ${i}`,
  }));

  it("returns null when there are fewer than 3 cards", () => {
    expect(sampleFlashcardsAsMatching([{ question: "A", answer: "1" }], "CSC 101", "Set")).toBeNull();
  });

  it("returns a matching question with between 3 and 5 pairs for a deterministic rng", () => {
    const result = sampleFlashcardsAsMatching(sixCards, "CSC 101", "Set", () => 0);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("matching");
    expect(result!.pairs.length).toBeGreaterThanOrEqual(3);
    expect(result!.pairs.length).toBeLessThanOrEqual(5);
  });

  it("maps card.question to term and card.answer to definition", () => {
    const result = sampleFlashcardsAsMatching(sixCards, "CSC 101", "Set", () => 0)!;
    for (const pair of result.pairs) {
      expect(pair.term).toMatch(/^Term \d$/);
      expect(pair.definition).toMatch(/^Definition \d$/);
    }
  });

  it("caps the sample at 5 pairs even with many cards", () => {
    const twenty = Array.from({ length: 20 }, (_, i) => ({ question: `T${i}`, answer: `D${i}` }));
    const result = sampleFlashcardsAsMatching(twenty, "CSC 101", "Set", () => 0.999)!;
    expect(result.pairs.length).toBeLessThanOrEqual(5);
  });

  it("returns null when fewer than 3 unique trimmed definitions are available", () => {
    const duplicateDefinitions = [
      { question: "Term A", answer: "Shared" },
      { question: "Term B", answer: " Shared " },
      { question: "Term C", answer: "Other" },
      { question: "Term D", answer: "Other" },
    ];

    expect(sampleFlashcardsAsMatching(duplicateDefinitions, "CSC 101", "Set", () => 0)).toBeNull();
  });

  it("selects only unique trimmed definitions", () => {
    const duplicateDefinitions = [
      { question: "Term A", answer: "Alpha" },
      { question: "Term B", answer: " Alpha " },
      { question: "Term C", answer: "Beta" },
      { question: "Term D", answer: "Gamma" },
      { question: "Term E", answer: "Delta" },
    ];

    const result = sampleFlashcardsAsMatching(duplicateDefinitions, "CSC 101", "Set", () => 0)!;
    const normalizedDefinitions = result.pairs.map((pair) => pair.definition.trim());

    expect(new Set(normalizedDefinitions).size).toBe(normalizedDefinitions.length);
    expect(result.pairs.length).toBeGreaterThanOrEqual(3);
  });
});

describe("sampleCardsForGeneration", () => {
  const tenCards: RawFlashcardTestShape[] = Array.from({ length: 10 }, (_, i) => ({
    question: `Q${i}`,
    answer: `A${i}`,
  }));

  it("returns up to `count` cards", () => {
    const result = sampleCardsForGeneration(tenCards, 5, () => 0);
    expect(result).toHaveLength(5);
  });

  it("returns all cards when the set has fewer than `count`", () => {
    const threeCards = tenCards.slice(0, 3);
    const result = sampleCardsForGeneration(threeCards, 10, () => 0);
    expect(result).toHaveLength(3);
  });

  it("does not mutate the input array", () => {
    const copy = [...tenCards];
    sampleCardsForGeneration(tenCards, 5, () => 0.5);
    expect(tenCards).toEqual(copy);
  });

  it("shuffles deterministically for a fixed rng", () => {
    const result = sampleCardsForGeneration(tenCards, 10, () => 0);
    expect(result.map((c) => c.question)).toEqual([
      "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q0",
    ]);
  });
});

function makeQuestion(id: string): BlocksSingleQuestion {
  return {
    id,
    kind: "single",
    type: "multiple_choice",
    question: id,
    options: ["a", "b"],
    correctAnswer: "a",
    sourceCourse: "CSC 101",
    sourceSet: "Set",
  };
}

describe("needsTopUp", () => {
  it("is true when fewer than the threshold are unserved", () => {
    const pool = [makeQuestion("q1"), makeQuestion("q2")];
    expect(needsTopUp(pool, new Set(), 5)).toBe(true);
  });

  it("is false when at least the threshold are unserved", () => {
    const pool = Array.from({ length: 5 }, (_, i) => makeQuestion(`q${i}`));
    expect(needsTopUp(pool, new Set(), 5)).toBe(false);
  });

  it("counts served questions as not available", () => {
    const pool = Array.from({ length: 5 }, (_, i) => makeQuestion(`q${i}`));
    expect(needsTopUp(pool, new Set(["q0", "q1"]), 5)).toBe(true); // only 3 unserved left
  });
});

describe("pickNextQuestion", () => {
  it("returns null when the pool is empty or fully served", () => {
    expect(pickNextQuestion([], new Set())).toBeNull();
    const pool = [makeQuestion("q1")];
    expect(pickNextQuestion(pool, new Set(["q1"]))).toBeNull();
  });

  it("returns an unserved question, never a served one", () => {
    const pool = [makeQuestion("q1"), makeQuestion("q2")];
    const picked = pickNextQuestion(pool, new Set(["q1"]), () => 0);
    expect(picked?.id).toBe("q2");
  });
});
