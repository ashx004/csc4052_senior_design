import { describe, expect, it } from "vitest";
import { copiedRatio, parseCsv, summarizeScores, toCsv } from "./quizEval";

describe("copiedRatio", () => {
  const doc = "A queue is a first in first out structure. Items leave in the order they arrived.";
  it("is 1 for a sentence copied from the document", () => {
    expect(copiedRatio("A queue is a first in first out structure", doc)).toBe(1);
  });
  it("is 0 for a fully rephrased question", () => {
    expect(copiedRatio("Which element would a bank line serve next after three people join?", doc)).toBe(0);
  });
  it("ignores case and punctuation, and is 0 for very short questions", () => {
    expect(copiedRatio("ITEMS leave, in the order they ARRIVED?", doc)).toBe(1);
    expect(copiedRatio("A queue?", doc)).toBe(0);
  });
});

describe("CSV", () => {
  it("round-trips commas, quotes and new lines", () => {
    const rows = [["id", "question"], ["1", 'Say "hi", then\nleave']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it("reads CRLF files saved by spreadsheet apps and skips blank lines", () => {
    expect(parseCsv("﻿a,b\r\n1,2\r\n\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("summarizeScores", () => {
  it("counts yes answers per model and difficulty, skipping blanks", () => {
    const rows = [
      ["model", "difficulty", "level_correct", "distractors_plausible", "one_right_answer"],
      ["m1", "exam", "Y", "yes", "n"],
      ["m1", "exam", "N", "", "Y"],
      ["m2", "review", "y", "y", "y"],
    ];
    expect(summarizeScores(rows)).toEqual([
      { model: "m1", difficulty: "exam", scored: 2, level_correct: "1/2", distractors_plausible: "1/1", one_right_answer: "1/2" },
      { model: "m2", difficulty: "review", scored: 1, level_correct: "1/1", distractors_plausible: "1/1", one_right_answer: "1/1" },
    ]);
  });
});
