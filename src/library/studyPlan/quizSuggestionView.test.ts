import { describe, expect, it } from "vitest";
import type { MissedQuestionsSuggestion } from "./types";
import { resolvePracticeQuestions, resolveQuizSuggestionView, isRecommendedSuggestion } from "./quizSuggestionView";

function activeSuggestion(
  overrides: Partial<MissedQuestionsSuggestion> = {},
): MissedQuestionsSuggestion {
  return {
    type: "missed_questions",
    courseId: "course-1",
    sourceDocKey: "doc-1",
    quizId: "quiz-1",
    questionIds: ["q1", "q2", "q3"],
    questionFailureCounts: { q1: 1, q2: 1, q3: 1 },
    status: "active",
    priority: 3,
    linkedTaskId: null,
    sourceAttemptId: "attempt-1",
    ...overrides,
  };
}

describe("resolvePracticeQuestions", () => {
  it("returns only task question IDs that still exist in the quiz", () => {
    expect(resolvePracticeQuestions(
      [{ id: "q1" }, { id: "q2" }],
      { mode: "missed_questions", questionIds: ["q2", "deleted"] },
    ).map((q) => q.id)).toEqual(["q2"]);
  });

  it("returns unavailable when no target questions exist", () => {
    expect(resolvePracticeQuestions([{ id: "q1" }], {
      mode: "missed_questions",
      questionIds: ["deleted"],
    })).toEqual([]);
  });
});

describe("resolveQuizSuggestionView", () => {
  it("still offers add when the suggestion is already linked to a task (idempotent re-add)", () => {
    expect(resolveQuizSuggestionView(activeSuggestion({ linkedTaskId: "task-1" })))
      .toEqual({ primaryAction: "add" });
  });

  it("hides the card when nothing was missed", () => {
    expect(resolveQuizSuggestionView(null)).toBeNull();
    expect(resolveQuizSuggestionView(activeSuggestion({ questionIds: [] }))).toBeNull();
    expect(resolveQuizSuggestionView(activeSuggestion({
      status: "resolved",
      questionIds: ["q1"],
    }))).toBeNull();
  });

  it("offers add when the suggestion is active and has no task", () => {
    expect(resolveQuizSuggestionView(activeSuggestion({ linkedTaskId: null })))
      .toEqual({ primaryAction: "add" });
  });

  it("keeps offering add for an already-added suggestion so it does not vanish", () => {
    expect(resolveQuizSuggestionView(activeSuggestion({
      status: "added",
      linkedTaskId: "task-1",
    }))).toEqual({ primaryAction: "add" });
  });

  it("hides a dismissed suggestion (it returns only when missed again)", () => {
    expect(resolveQuizSuggestionView(activeSuggestion({
      status: "dismissed",
      questionIds: ["q1"],
    }))).toBeNull();
  });

  it("offers a source fallback when practice questions are unavailable", () => {
    expect(resolveQuizSuggestionView(activeSuggestion({
      status: "unavailable",
      questionIds: [],
    }))).toEqual({ primaryAction: "unavailable" });
  });
});

describe("isRecommendedSuggestion", () => {
  it("returns true for active suggestion with no task and no linkedTaskId", () => {
    const suggestion = activeSuggestion({ status: "active", linkedTaskId: null });
    expect(isRecommendedSuggestion(suggestion)).toBe(true);
  });

  it("returns false when status is 'added'", () => {
    const suggestion = activeSuggestion({ status: "added", linkedTaskId: "task-1" });
    expect(isRecommendedSuggestion(suggestion)).toBe(false);
  });

  it("returns false when active but linkedTaskId is set", () => {
    const suggestion = activeSuggestion({ status: "active", linkedTaskId: "task-1" });
    expect(isRecommendedSuggestion(suggestion)).toBe(false);
  });

  it("returns false when status is 'dismissed'", () => {
    const suggestion = activeSuggestion({ status: "dismissed", linkedTaskId: null });
    expect(isRecommendedSuggestion(suggestion)).toBe(false);
  });

  it("returns false when status is 'resolved'", () => {
    const suggestion = activeSuggestion({ status: "resolved", linkedTaskId: null });
    expect(isRecommendedSuggestion(suggestion)).toBe(false);
  });

  it("returns false when status is 'unavailable'", () => {
    const suggestion = activeSuggestion({ status: "unavailable", linkedTaskId: null });
    expect(isRecommendedSuggestion(suggestion)).toBe(false);
  });

  it("returns false when questionIds is empty", () => {
    const suggestion = activeSuggestion({ status: "active", linkedTaskId: null, questionIds: [] });
    expect(isRecommendedSuggestion(suggestion)).toBe(false);
  });

  it("returns false when null", () => {
    expect(isRecommendedSuggestion(null as any)).toBe(false);
  });
});
