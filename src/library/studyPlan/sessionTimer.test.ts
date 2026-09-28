import { describe, expect, it } from "vitest";
import {
  calculateActiveMinutes,
  getActivityUrl,
  getActivityUrlFromTarget,
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

describe("getActivityUrlFromTarget", () => {
  it("builds a document URL and appends taskId when provided", () => {
    const target = {
      kind: "document" as const,
      resourceId: "res-1",
      sourceDocKey: "users/u/resources/sql.pdf",
    };
    expect(getActivityUrlFromTarget("course-1", target)).toBe(
      "/courses/course-1?resourceId=res-1"
    );
    expect(getActivityUrlFromTarget("course-1", target, "task-1")).toBe(
      "/courses/course-1?resourceId=res-1&taskId=task-1"
    );
  });

  it("builds a full quiz URL and appends taskId when provided", () => {
    const target = {
      kind: "quiz" as const,
      quizId: "quiz-1",
      sourceDocKey: null,
      mode: "full" as const,
    };
    expect(getActivityUrlFromTarget("course-1", target)).toBe(
      "/courses/course-1/quizzes/quiz-1?mode=take"
    );
    expect(getActivityUrlFromTarget("course-1", target, "task-1")).toBe(
      "/courses/course-1/quizzes/quiz-1?mode=take&taskId=task-1"
    );
  });

  it("routes missed-question practice without question IDs in the URL", () => {
    const target = {
      kind: "quiz" as const,
      quizId: "quiz-1",
      sourceDocKey: null,
      mode: "missed_questions" as const,
      questionIds: ["q2", "q5"],
    };
    expect(getActivityUrlFromTarget("course-1", target, "task-1")).toBe(
      "/courses/course-1/quizzes/quiz-1?mode=practice&taskId=task-1"
    );
    expect(getActivityUrlFromTarget("course-1", target)).toBe(
      "/courses/course-1/quizzes/quiz-1?mode=practice"
    );
  });

  it("builds a flashcard set URL and appends taskId when provided", () => {
    const target = {
      kind: "flashcard_set" as const,
      setId: "set-1",
      sourceDocKey: null,
    };
    expect(getActivityUrlFromTarget("course-1", target)).toBe(
      "/courses/course-1/flashcards?setId=set-1"
    );
    expect(getActivityUrlFromTarget("course-1", target, "task-1")).toBe(
      "/courses/course-1/flashcards?setId=set-1&taskId=task-1"
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
