import { describe, expect, it } from "vitest";
import { buildDailyQuizFocus, conceptEvidenceFromQuestions } from "./dailyQuizTarget";

const base = { documentMastery: null, daysUntilExam: null, questionCount: 10, maxCount: 10 };

describe("buildDailyQuizFocus", () => {
  it("gives every quota the level its concept earned", () => {
    const focus = buildDailyQuizFocus({
      ...base,
      concepts: [
        { conceptKey: "a", label: "A", missCount: 1, conceptMastery: 30, lastAskedLevel: "review", repeatMissCount: 0 },
        { conceptKey: "b", label: "B", missCount: 1, conceptMastery: 90, lastAskedLevel: "exam", repeatMissCount: 0 },
      ],
    });
    expect(focus?.quotas.find((q) => q.conceptKey === "a")?.level).toBe("review");
    expect(focus?.quotas.find((q) => q.conceptKey === "b")?.level).toBe("challenge");
  });

  it("returns null when there are no usable concepts", () => {
    expect(buildDailyQuizFocus({ ...base, concepts: [], documentMastery: 0.9 })).toBeNull();
  });

  it("seeds an unmeasured concept from the document", () => {
    const focus = buildDailyQuizFocus({
      ...base,
      concepts: [{ conceptKey: "a", label: "A", missCount: 1, conceptMastery: null, lastAskedLevel: null, repeatMissCount: 0 }],
      documentMastery: 0.9,
      questionCount: 6,
    });
    expect(focus?.quotas[0].level).toBe("exam");
  });

  it("keeps the per-concept item floor", () => {
    const focus = buildDailyQuizFocus({
      ...base,
      concepts: [
        { conceptKey: "a", label: "A", missCount: 5, conceptMastery: null, lastAskedLevel: null, repeatMissCount: 0 },
        { conceptKey: "b", label: "B", missCount: 1, conceptMastery: null, lastAskedLevel: null, repeatMissCount: 0 },
      ],
    });
    expect(focus?.quotas.every((q) => q.items >= 2)).toBe(true);
  });

  it("starts with an empty avoid list", () => {
    const focus = buildDailyQuizFocus({
      ...base,
      concepts: [{ conceptKey: "a", label: "A", missCount: 1, conceptMastery: null, lastAskedLevel: null, repeatMissCount: 0 }],
    });
    expect(focus?.avoid).toEqual([]);
  });
});

describe("conceptEvidenceFromQuestions", () => {
  it("groups by normalized key, drops unusable labels, and joins mastery by key", () => {
    const evidence = conceptEvidenceFromQuestions(
      [{ concept: "The Stack" }, { concept: "stack " }, { concept: "Question 3" }, { concept: "Heap" }, {}],
      new Map([["stack", { value: 40, lastAskedLevel: "exam" as const }]]),
    );
    expect(evidence).toHaveLength(2);
    const stack = evidence.find((e) => e.conceptKey === "stack");
    expect(stack).toMatchObject({ label: "The Stack", missCount: 2, conceptMastery: 40, lastAskedLevel: "exam" });
    expect(evidence.find((e) => e.conceptKey === "heap")).toMatchObject({ conceptMastery: null, lastAskedLevel: null });
  });
});
