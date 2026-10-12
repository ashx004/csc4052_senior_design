import { describe, expect, it } from "vitest";
import { answerableQuestions, groupQuizQuestions, scoreQuiz, type CustomQuizQuestion } from "./quizItems";

const q = (id: string, extra: Partial<CustomQuizQuestion> = {}): CustomQuizQuestion => ({
  id,
  type: "multiple_choice",
  question: id,
  options: ["a", "b"],
  correctAnswer: "a",
  ...extra,
});

describe("groupQuizQuestions", () => {
  it("keeps standard questions in order and gathers a matching group where it first appears", () => {
    const items = groupQuizQuestions([
      q("1"),
      q("m1", { type: "matching", matchingGroupId: "g" }),
      q("2"),
      q("m2", { type: "matching", matchingGroupId: "g" }),
    ]);
    expect(items.map((i) => (i.kind === "standard" ? i.question.id : `group:${i.questions.map((x) => x.id).join("+")}`))).toEqual(["1", "group:m1+m2", "2"]);
  });

  it("drops a matching question that has no group", () => {
    expect(groupQuizQuestions([q("1"), q("lost", { type: "matching" })])).toHaveLength(1);
  });
});

describe("answerableQuestions / scoreQuiz", () => {
  it("only counts questions that can be shown", () => {
    const all = [q("1"), q("lost", { type: "matching" })];
    expect(answerableQuestions(all).map((x) => x.id)).toEqual(["1"]);
  });

  it("scores exact matches and rounds the percent", () => {
    const qs = [q("1"), q("2"), q("3")];
    expect(scoreQuiz(qs, { "1": "a", "2": "b", "3": "a" })).toEqual({ score: 2, total: 3, percent: 67 });
    expect(scoreQuiz([], {})).toEqual({ score: 0, total: 0, percent: 0 });
  });
});
