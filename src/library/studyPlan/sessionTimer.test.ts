import { describe, expect, it } from "vitest";
import {
  calculateActiveMinutes,
  getActivityUrl,
  formatElapsedTime,
} from "./sessionTimer";

function ts(ms: number) {
  return { toMillis: () => ms };
}

describe("calculateActiveMinutes", () => {
  it("returns 0 for empty periods", () => {
    expect(calculateActiveMinutes([])).toBe(0);
  });

  it("sums completed periods", () => {
    const periods = [
      { startedAt: ts(0), endedAt: ts(60000) },           // 1 min
      { startedAt: ts(120000), endedAt: ts(300000) },      // 3 min
    ];
    expect(calculateActiveMinutes(periods)).toBe(4);
  });

  it("excludes open-ended periods (endedAt = null)", () => {
    const periods = [
      { startedAt: ts(0), endedAt: ts(60000) },
      { startedAt: ts(120000), endedAt: null },
    ];
    expect(calculateActiveMinutes(periods)).toBe(1);
  });

  it("rounds down to whole minutes", () => {
    const periods = [
      { startedAt: ts(0), endedAt: ts(90000) }, // 1.5 min
    ];
    expect(calculateActiveMinutes(periods)).toBe(1);
  });
});

describe("getActivityUrl", () => {
  it("builds quiz URL", () => {
    expect(getActivityUrl("quiz", "csc430", "quiz1")).toBe(
      "/courses/csc430/quizzes/quiz1?mode=take"
    );
  });

  it("builds flashcard URL with setId", () => {
    expect(getActivityUrl("flashcards", "csc430", "set1")).toBe(
      "/courses/csc430/flashcards?setId=set1"
    );
  });

  it("falls back to course learning when a quiz target is missing", () => {
    expect(getActivityUrl("quiz", "csc430", null)).toBe(
      "/courses/csc430/learning"
    );
  });

  it("falls back to course learning when a flashcard target is missing", () => {
    expect(getActivityUrl("flashcards", "csc430", null)).toBe(
      "/courses/csc430/learning"
    );
  });

  it("builds reading URL", () => {
    expect(getActivityUrl("reading", "csc430", null)).toBe(
      "/courses/csc430/learning"
    );
  });

  it("builds AI explanation URL", () => {
    expect(getActivityUrl("ai_explanation", "csc430", null)).toBe(
      "/ai-assistant"
    );
  });
});

describe("formatElapsedTime", () => {
  it("formats seconds as mm:ss", () => {
    expect(formatElapsedTime(0)).toBe("0:00");
    expect(formatElapsedTime(65)).toBe("1:05");
    expect(formatElapsedTime(3600)).toBe("60:00");
  });

  it("pads seconds with leading zero", () => {
    expect(formatElapsedTime(5)).toBe("0:05");
  });
});
