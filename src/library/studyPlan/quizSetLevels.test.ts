import { describe, expect, it } from "vitest";
import { isGeneratedForPlan, quizSetLevelFields } from "@/src/library/studyPlan/quizSetLevels";
import { storedQuizDifficulty } from "@/src/library/quizDifficulty";

describe("quizSetLevelFields", () => {
  it("records the highest level and a per-concept map", () => {
    const fields = quizSetLevelFields({
      quotas: [
        { conceptKey: "a", label: "A", items: 1, level: "review" },
        { conceptKey: "b", label: "B", items: 1, level: "challenge" },
      ],
      avoid: [],
    });
    expect(fields.difficulty).toBe("challenge");
    expect(fields.conceptLevels).toEqual({ a: "review", b: "challenge" });
    expect(fields.mixedLevels).toBe(true);
  });

  it("is not mixed when every concept shares a level", () => {
    const fields = quizSetLevelFields({
      quotas: [
        { conceptKey: "a", label: "A", items: 1, level: "exam" },
        { conceptKey: "b", label: "B", items: 1, level: "exam" },
      ],
      avoid: [],
    });
    expect(fields.mixedLevels).toBe(false);
    expect(fields.difficulty).toBe("exam");
  });

  it("gives a quota with no level the set's derived level", () => {
    const fields = quizSetLevelFields({
      quotas: [
        { conceptKey: "a", label: "A", items: 1, level: "review" },
        { conceptKey: "b", label: "B", items: 1 },
      ],
      avoid: [],
    });
    expect(fields.conceptLevels).toEqual({ a: "review", b: "review" });
    expect(fields.mixedLevels).toBe(false);
  });

  it("reads back through storedQuizDifficulty", () => {
    const fields = quizSetLevelFields({
      quotas: [{ conceptKey: "a", label: "A", items: 1, level: "review" }],
      avoid: [],
    });
    expect(storedQuizDifficulty(fields.difficulty)).toBe("review");
  });
});

describe("quizSetLevelFields concept keys", () => {
  it("keys conceptLevels by the normalized concept key", () => {
    const fields = quizSetLevelFields({
      quotas: [{ conceptKey: "  The Recursion  ", label: "Recursion", items: 1, level: "challenge" }],
      avoid: [],
    });
    expect(fields.conceptLevels).toEqual({ recursion: "challenge" });
  });
});

describe("isGeneratedForPlan", () => {
  it("skips a set the daily plan generated", () => {
    expect(isGeneratedForPlan({ generatedForPlan: true, name: "Joins (daily practice)" })).toBe(true);
  });

  it("keeps a weak-spot set and a set saved before the marker existed", () => {
    expect(isGeneratedForPlan({ generatedForPlan: false })).toBe(false);
    expect(isGeneratedForPlan({ name: "Lecture 4" })).toBe(false);
    expect(isGeneratedForPlan(undefined)).toBe(false);
  });

  it("does not treat a truthy non-true value as the marker", () => {
    expect(isGeneratedForPlan({ generatedForPlan: "yes" })).toBe(false);
  });
});
