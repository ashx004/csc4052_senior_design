import { describe, expect, it } from "vitest";
import type { MissedQuestionsSuggestion } from "./types";
import { resolvePracticeQuestions, resolveQuizSuggestionView } from "./quizSuggestionView";

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
  it("shows View task when the suggestion already links an active task", () => {
    expect(resolveQuizSuggestionView(activeSuggestion({ linkedTaskId: "task-1" })))
      .toEqual({ primaryAction: "view_task", taskId: "task-1" });
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

  it("shows View task when the suggestion was already added to a task", () => {
    expect(resolveQuizSuggestionView(activeSuggestion({
      status: "added",
      linkedTaskId: "task-1",
    }))).toEqual({ primaryAction: "view_task", taskId: "task-1" });
  });

  it("offers a source fallback when practice questions are unavailable", () => {
    expect(resolveQuizSuggestionView(activeSuggestion({
      status: "unavailable",
      questionIds: [],
    }))).toEqual({ primaryAction: "unavailable" });
  });
});
