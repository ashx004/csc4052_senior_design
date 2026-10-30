import { describe, expect, it } from "vitest";
import { missedConcepts, resultHeadline, retryWeakSpot } from "./weakConceptModalView";
import type { ConceptWeakSpot } from "@/src/library/studyPlan/types";

describe("resultHeadline", () => {
  it("counts the concepts found", () => {
    const out = resultHeadline(6, 10, [
      { label: "Chain Rule", missCount: 3 }, { label: "Product Rule", missCount: 1 },
    ], false);
    expect(out.tone).toBe("weak");
    expect(out.pillText).toBe("Needs improvement");
    expect(out.noteText).toBe("You missed 4 questions, mainly in 2 concepts. Let's practice these topics to make it stick.");
  });

  it("congratulates a clean attempt instead of showing an empty list", () => {
    const out = resultHeadline(10, 10, [], false);
    expect(out.tone).toBe("clear");
    expect(out.noteText).toContain("Nothing weak");
  });

  it("says the topics are still being worked out when naming has not returned", () => {
    const out = resultHeadline(6, 10, [], true);
    expect(out.tone).toBe("weak");
    expect(out.noteText).toContain("still working out");
  });

  it("uses the singular for one concept and one question", () => {
    const out = resultHeadline(9, 10, [{ label: "Chain Rule", missCount: 1 }], false);
    expect(out.noteText).toContain("1 question");
    expect(out.noteText).toContain("1 concept");
  });
});

describe("missedConcepts", () => {
  const questions = [
    { id: "q1", correctAnswer: "a", concept: "Chain Rule" },
    { id: "q2", correctAnswer: "a", concept: "the chain rule" },
    { id: "q3", correctAnswer: "a", concept: "Product Rule" },
    { id: "q4", correctAnswer: "a" },
    { id: "q5", correctAnswer: "a", concept: "Question 5" },
    { id: "q6", correctAnswer: "a", concept: "Quotient Rule" },
  ];
  const answers = { q1: "b", q2: "b", q3: "b", q4: "b", q5: "b", q6: "a" };

  it("groups misses by concept key, most missed first, and counts the unnamed", () => {
    const out = missedConcepts(questions, answers, {}, []);
    expect(out.concepts).toEqual([
      { conceptKey: "chain rule", label: "Chain Rule", missCount: 2 },
      { conceptKey: "product rule", label: "Product Rule", missCount: 1 },
    ]);
    expect(out.unnamedIds).toEqual(["q4", "q5"]);
  });

  it("uses labels the naming call returned and an open weak spot's display label", () => {
    const out = missedConcepts(questions, answers, { q4: "product rule", q5: "Limits" }, [
      { conceptKey: "product rule", label: "Product Rule (derivatives)" },
    ]);
    expect(out.concepts).toEqual([
      { conceptKey: "chain rule", label: "Chain Rule", missCount: 2 },
      { conceptKey: "product rule", label: "Product Rule (derivatives)", missCount: 2 },
      { conceptKey: "limits", label: "Limits", missCount: 1 },
    ]);
    expect(out.unnamedIds).toEqual([]);
  });
});

describe("retryWeakSpot", () => {
  const spot = (conceptKey: string, misses: ConceptWeakSpot["misses"], sourceDocKeys: string[]): ConceptWeakSpot => ({
    courseId: "c1", conceptKey, label: conceptKey, misses, sourceDocKeys,
    status: "open", openedAtMs: 1, retiredAtMs: null, timesReopened: 0,
  });

  it("merges the chosen open spots into one, so each quiz gets one task", () => {
    const out = retryWeakSpot([
      spot("chain rule", [{ questionId: "q1", quizId: "z1", failureCount: 2 }], ["doc-a"]),
      spot("product rule", [{ questionId: "q3", quizId: "z1", failureCount: 1 }], ["doc-a", "doc-b"]),
      spot("limits", [{ questionId: "q9", quizId: "z2", failureCount: 1 }], ["doc-c"]),
    ], ["chain rule", "product rule"]);
    expect(out?.label).toBe("chain rule, product rule");
    expect(out?.misses.map((m) => m.questionId)).toEqual(["q1", "q3"]);
    expect(out?.sourceDocKeys).toEqual(["doc-a", "doc-b"]);
  });

  it("returns null when none of the concepts has a stored weak spot", () => {
    expect(retryWeakSpot([], ["chain rule"])).toBeNull();
  });
});
