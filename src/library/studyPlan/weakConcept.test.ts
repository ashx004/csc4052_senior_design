import { describe, expect, it } from "vitest";
import { weakConceptReason } from "./weakConcept";

describe("weakConceptReason", () => {
  it("names the concept and counts missed questions", () => {
    const r = weakConceptReason({
      conceptLabel: "Derivatives",
      questionIds: ["q1", "q2", "q3", "q4"],
      questionFailureCounts: { q1: 1, q2: 1, q3: 1, q4: 1 },
    });
    expect(r.missedCount).toBe(4);
    expect(r.repeatedCount).toBe(0);
    expect(r.reason).toBe("You missed 4 questions on Derivatives");
  });

  it("uses 'keep missing' wording when questions were missed more than once", () => {
    const r = weakConceptReason({
      conceptLabel: "Derivatives",
      questionIds: ["q1", "q2"],
      questionFailureCounts: { q1: 3, q2: 1 },
    });
    expect(r.repeatedCount).toBe(1);
    expect(r.reason).toBe("You keep missing 2 questions on Derivatives");
  });

  it("singularizes one question", () => {
    expect(
      weakConceptReason({ conceptLabel: "Joins", questionIds: ["q1"], questionFailureCounts: { q1: 1 } }).reason,
    ).toBe("You missed 1 question on Joins");
  });

  it("falls back to 'this topic' when the label is empty", () => {
    expect(
      weakConceptReason({ conceptLabel: "", questionIds: ["q1"], questionFailureCounts: {} }).reason,
    ).toBe("You missed 1 question on this topic");
  });
});
