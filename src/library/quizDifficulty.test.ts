import { describe, expect, it } from "vitest";
import {
  QUIZ_DIFFICULTIES,
  QUIZ_DIFFICULTY_OPTIONS,
  buildBloomPlan,
  difficultyLabel,
  parseQuizDifficulty,
  storedQuizDifficulty,
} from "./quizDifficulty";

describe("buildBloomPlan", () => {
  it("matches the spec example for 10 exam-style questions", () => {
    expect(buildBloomPlan("exam", 10)).toEqual([
      "remember", "remember",
      "understand", "understand", "understand",
      "apply", "apply", "apply", "apply",
      "analyze",
    ]);
  });
  it("uses only the review mix", () => {
    expect(buildBloomPlan("review", 5)).toEqual(["remember", "remember", "understand", "understand", "apply"]);
  });
  it("uses only the challenge mix", () => {
    expect(buildBloomPlan("challenge", 10)).toEqual([
      "understand",
      "apply", "apply", "apply", "apply",
      "analyze", "analyze", "analyze", "analyze",
      "evaluate",
    ]);
  });
  it.each([
    ["exam", 1, ["apply"]],
    ["exam", 3, ["remember", "understand", "apply"]],
    ["review", 1, ["remember"]],
    ["challenge", 3, ["apply", "analyze", "evaluate"]],
  ] as const)("handles small quizzes: %s × %d", (difficulty, count, expected) => {
    expect(buildBloomPlan(difficulty, count)).toEqual(expected);
  });
  it("always returns exactly questionCount levels and never 'create'", () => {
    for (const difficulty of QUIZ_DIFFICULTIES) {
      for (let count = 1; count <= 20; count++) {
        const plan = buildBloomPlan(difficulty, count);
        expect(plan).toHaveLength(count);
        expect(plan).not.toContain("create");
      }
    }
  });
});

describe("difficulty parsing and labels", () => {
  it.each([undefined, null, "", "hard", "EXAM", 3])("falls back to exam for %j", (value) => {
    expect(parseQuizDifficulty(value)).toBe("exam");
  });
  it.each(["review", "exam", "challenge"])("keeps valid value %s", (value) => {
    expect(parseQuizDifficulty(value)).toBe(value);
    expect(storedQuizDifficulty(value)).toBe(value);
  });
  it("returns null for quizzes saved before levels existed", () => {
    expect(storedQuizDifficulty(undefined)).toBeNull();
    expect(storedQuizDifficulty("hard")).toBeNull();
  });
  it("uses the approved labels and subtitles", () => {
    expect(QUIZ_DIFFICULTY_OPTIONS).toEqual([
      { value: "review", label: "Review", subtitle: "Check key facts and ideas" },
      { value: "exam", label: "Exam-style", subtitle: "Like a real class exam" },
      { value: "challenge", label: "Challenge", subtitle: "Apply and analyze in new situations" },
    ]);
    expect(difficultyLabel("exam")).toBe("Exam-style");
  });
});
