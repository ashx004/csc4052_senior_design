import { describe, expect, it } from "vitest";
import { parseGradingBreakdown } from "./gradingBreakdown";

describe("parseGradingBreakdown", () => {
  it("reads a comma-separated breakdown", () => {
    expect(parseGradingBreakdown("Exams 40%, Homework 30%, Project 30%")).toEqual([
      { label: "Exams", percent: 40 },
      { label: "Homework", percent: 30 },
      { label: "Project", percent: 30 },
    ]);
  });

  it("reads colons, parentheses, percent-first and 'and'", () => {
    expect(parseGradingBreakdown("Midterm: 25%; Final (35%); 20% Labs and 20% Quizzes")?.map((s) => [s.label, s.percent])).toEqual([
      ["Midterm", 25],
      ["Final", 35],
      ["Labs", 20],
      ["Quizzes", 20],
    ]);
  });

  it("charts points as shares of the total and ignores a trailing grade scale", () => {
    expect(
      parseGradingBreakdown("Exams 300 pts, Homework 60 pts, WebWork 20 pts; Scale: A>=90%, B>=80%, C>=70%, D>=60%, F<60%")
    ).toEqual([
      { label: "Exams", percent: 78.9 },
      { label: "Homework", percent: 15.8 },
      { label: "WebWork", percent: 5.3 },
    ]);
    expect(parseGradingBreakdown("Exams 40%, Homework 60 pts")).toBeNull();
  });

  it("gives up on text that is not a clean list of weights", () => {
    expect(parseGradingBreakdown("Graded on a curve")).toBeNull();
    expect(parseGradingBreakdown("Exams 40%")).toBeNull();
    expect(parseGradingBreakdown("Exams 40%, see syllabus for the rest")).toBeNull();
    expect(parseGradingBreakdown("Exams 40%, Homework 20%")).toBeNull();
    expect(parseGradingBreakdown("")).toBeNull();
    expect(parseGradingBreakdown(undefined)).toBeNull();
  });
});
