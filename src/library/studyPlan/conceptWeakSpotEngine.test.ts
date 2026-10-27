import { describe, expect, it } from "vitest";
import {
  reconcileConceptWeakSpots,
  type AttemptConceptResult,
} from "./conceptWeakSpotEngine";

function miss(questionId: string, conceptLabel: string | null): AttemptConceptResult {
  return {
    questionId,
    quizId: "z1",
    conceptLabel,
    sourceDocKey: null,
    isCorrect: false,
  };
}

function correct(questionId: string, conceptLabel: string | null): AttemptConceptResult {
  return {
    questionId,
    quizId: "z1",
    conceptLabel,
    sourceDocKey: null,
    isCorrect: true,
  };
}

describe("reconcileConceptWeakSpots", () => {
  it("opens one weak spot per concept with that concept's miss count", () => {
    const next = reconcileConceptWeakSpots([], [
      miss("q1", "Chain Rule"), miss("q2", "Chain Rule"), miss("q3", "Chain Rule"),
      miss("q4", "Product Rule"), correct("q5", "Product Rule"),
    ], 1000);
    expect(next).toHaveLength(2);
    expect(next.find((w) => w.conceptKey === "chain rule")!.misses).toHaveLength(3);
    expect(next.find((w) => w.conceptKey === "product rule")!.misses).toHaveLength(1);
  });

  it("merges labels that share a concept key into one weak spot", () => {
    const next = reconcileConceptWeakSpots([], [
      miss("q1", "Chain Rule"), miss("q2", "the chain rule"),
    ], 1000);
    expect(next).toHaveLength(1);
    expect(next[0].misses).toHaveLength(2);
  });

  it("raises failureCount when the same question is missed again", () => {
    const first = reconcileConceptWeakSpots([], [miss("q1", "Chain Rule")], 1000);
    const second = reconcileConceptWeakSpots(first, [miss("q1", "Chain Rule")], 2000);
    expect(second[0].misses[0].failureCount).toBe(2);
  });

  it("drops a miss from the weak spot when that question is later correct", () => {
    const first = reconcileConceptWeakSpots([], [miss("q1", "Chain Rule"), miss("q2", "Chain Rule")], 1000);
    const second = reconcileConceptWeakSpots(first, [correct("q1", "Chain Rule")], 2000);
    expect(second[0].misses.map((m) => m.questionId)).toEqual(["q2"]);
  });

  it("ignores results whose concept is not yet named", () => {
    const next = reconcileConceptWeakSpots([], [miss("q1", null)], 1000);
    expect(next).toEqual([]);
  });

  it("ignores a placeholder label the model returned", () => {
    const next = reconcileConceptWeakSpots([], [miss("q1", "Question 4")], 1000);
    expect(next).toEqual([]);
  });

  it("records every source document the evidence came from, without duplicates", () => {
    const next = reconcileConceptWeakSpots([], [
      { questionId: "q1", quizId: "z1", conceptLabel: "Chain Rule", sourceDocKey: "a.pdf", isCorrect: false },
      { questionId: "q2", quizId: "z2", conceptLabel: "Chain Rule", sourceDocKey: "a.pdf", isCorrect: false },
      { questionId: "q3", quizId: "z2", conceptLabel: "Chain Rule", sourceDocKey: "b.pdf", isCorrect: false },
    ], 1000);
    expect(next[0].sourceDocKeys).toEqual(["a.pdf", "b.pdf"]);
  });

  it("keeps the quizId on each miss so retry tasks can be split per quiz", () => {
    const next = reconcileConceptWeakSpots([], [
      { questionId: "q1", quizId: "z1", conceptLabel: "Chain Rule", sourceDocKey: null, isCorrect: false },
      { questionId: "q2", quizId: "z2", conceptLabel: "Chain Rule", sourceDocKey: null, isCorrect: false },
    ], 1000);
    expect(next[0].misses.map((m) => m.quizId)).toEqual(["z1", "z2"]);
  });
});
