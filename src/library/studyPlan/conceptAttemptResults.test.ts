import { describe, expect, it } from "vitest";
import { attemptConceptResults, questionsNeedingNames } from "./conceptAttemptResults";

describe("attemptConceptResults", () => {
  it("reads the concept tag already on each question", () => {
    const out = attemptConceptResults(
      [{ id: "q1", concept: "Chain Rule" }],
      [{ questionId: "q1", selectedAnswer: "a", correctAnswer: "b", isCorrect: false }],
      "z1", "lec4.pdf",
    );
    expect(out).toEqual([{
      questionId: "q1", quizId: "z1", conceptLabel: "Chain Rule",
      sourceDocKey: "lec4.pdf", isCorrect: false,
    }]);
  });

  it("marks an untagged question as unnamed rather than guessing a label", () => {
    const out = attemptConceptResults(
      [{ id: "q1" }],
      [{ questionId: "q1", selectedAnswer: "a", correctAnswer: "b", isCorrect: false }],
      "z1", null,
    );
    expect(out[0].conceptLabel).toBeNull();
  });
});

describe("questionsNeedingNames", () => {
  it("asks only for missed questions that have no concept", () => {
    const ids = questionsNeedingNames([
      { questionId: "q1", quizId: "z", conceptLabel: null, sourceDocKey: null, isCorrect: false },
      { questionId: "q2", quizId: "z", conceptLabel: null, sourceDocKey: null, isCorrect: true },
      { questionId: "q3", quizId: "z", conceptLabel: "Chain Rule", sourceDocKey: null, isCorrect: false },
    ]);
    expect(ids).toEqual(["q1"]);
  });
});
