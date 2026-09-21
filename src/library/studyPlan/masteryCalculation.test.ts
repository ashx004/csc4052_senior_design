import { describe, expect, it } from "vitest";
import {
  computeQuizMastery,
  computeFlashcardEngagement,
  isCardValid,
  buildMasterySignalId,
} from "./masteryCalculation";

describe("computeQuizMastery", () => {
  it("returns 0 for an empty attempts array", () => {
    expect(computeQuizMastery([])).toBe(0);
  });

  it("returns the score ratio for a single attempt", () => {
    expect(computeQuizMastery([{ score: 8, total: 10 }])).toBeCloseTo(0.8);
  });

  it("weights the 3 most recent attempts (1.0, 0.5, 0.25)", () => {
    // Attempts ordered most-recent first
    const attempts = [
      { score: 10, total: 10 }, // weight 1.0 → 1.0
      { score: 5, total: 10 },  // weight 0.5 → 0.25
      { score: 0, total: 10 },  // weight 0.25 → 0.0
    ];
    // weighted sum = (1.0*1.0 + 0.5*0.5 + 0.25*0.0) / (1.0+0.5+0.25)
    // = 1.25 / 1.75 ≈ 0.7143
    expect(computeQuizMastery(attempts)).toBeCloseTo(0.7143, 3);
  });

  it("ignores attempts beyond the 3rd", () => {
    const attempts = [
      { score: 10, total: 10 },
      { score: 10, total: 10 },
      { score: 10, total: 10 },
      { score: 0, total: 10 }, // ignored
    ];
    expect(computeQuizMastery(attempts)).toBeCloseTo(1.0);
  });

  it("handles attempts with total of 0 without dividing by zero", () => {
    expect(computeQuizMastery([{ score: 0, total: 0 }])).toBe(0);
  });
});

describe("isCardValid", () => {
  it("returns true when flipped and time >= 5000ms", () => {
    expect(isCardValid({ flipped: true, timeOnCardMs: 5000 })).toBe(true);
    expect(isCardValid({ flipped: true, timeOnCardMs: 10000 })).toBe(true);
  });

  it("returns false when not flipped", () => {
    expect(isCardValid({ flipped: false, timeOnCardMs: 10000 })).toBe(false);
  });

  it("returns false when time < 5000ms", () => {
    expect(isCardValid({ flipped: true, timeOnCardMs: 4999 })).toBe(false);
  });
});

describe("computeFlashcardEngagement", () => {
  it("returns 0 for empty cards array", () => {
    expect(computeFlashcardEngagement([], 10)).toBe(0);
  });

  it("returns 0 when totalCards is 0", () => {
    expect(computeFlashcardEngagement([], 0)).toBe(0);
  });

  it("counts only valid cards (flipped + 5s minimum)", () => {
    const cards = [
      { flipped: true, timeOnCardMs: 6000 },   // valid
      { flipped: true, timeOnCardMs: 3000 },   // invalid: too fast
      { flipped: false, timeOnCardMs: 10000 }, // invalid: not flipped
      { flipped: true, timeOnCardMs: 5000 },   // valid
    ];
    // 2 valid out of 5 total cards
    expect(computeFlashcardEngagement(cards, 5)).toBeCloseTo(0.4);
  });

  it("caps time per card at 5 minutes (300000ms) for validity check only", () => {
    const cards = [
      { flipped: true, timeOnCardMs: 600000 }, // valid (cap doesn't affect validity)
    ];
    expect(computeFlashcardEngagement(cards, 1)).toBeCloseTo(1.0);
  });
});

describe("buildMasterySignalId", () => {
  it("joins courseId, topicLabel, and signalType with underscores", () => {
    expect(buildMasterySignalId("csc430", "SQL Joins", "quiz_mastery")).toBe(
      "csc430_SQL Joins_quiz_mastery"
    );
  });
});
