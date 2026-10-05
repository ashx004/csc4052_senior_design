import { describe, expect, it } from "vitest";
import { missedQuestionTexts } from "./missedQuestionText";

const quiz = [
  { id: "q1", question: "What is a derivative?" },
  { id: "q2", question: "State the power rule." },
  { id: "q3", question: "Define a limit." },
];

describe("missedQuestionTexts", () => {
  it("maps ids to their question text in order", () => {
    expect(missedQuestionTexts(["q3", "q1"], quiz)).toEqual([
      "Define a limit.",
      "What is a derivative?",
    ]);
  });

  it("skips ids not present in the quiz", () => {
    expect(missedQuestionTexts(["q1", "missing"], quiz)).toEqual([
      "What is a derivative?",
    ]);
  });

  it("de-duplicates repeated ids", () => {
    expect(missedQuestionTexts(["q1", "q1"], quiz)).toEqual([
      "What is a derivative?",
    ]);
  });

  it("returns empty for no matches", () => {
    expect(missedQuestionTexts(["x"], quiz)).toEqual([]);
  });
});
