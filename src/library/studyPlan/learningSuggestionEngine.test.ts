import { describe, expect, it } from "vitest";
import type { MissedQuestionsSuggestion } from "./types";
import {
  computeSuggestionPriority,
  filterAvailableQuestions,
  reconcileMissedQuestions,
  selectPracticeQuestionIds,
} from "./learningSuggestionEngine";

const COURSE_ID = "course-1";
const QUIZ_ID = "quiz-1";
const SOURCE_DOC_KEY = "doc-1";

function input(results: Record<string, boolean>, id = "attempt-1") {
  return {
    id,
    attemptType: "full_quiz" as const,
    results,
    courseId: COURSE_ID,
    quizId: QUIZ_ID,
    sourceDocKey: SOURCE_DOC_KEY,
  };
}

function practiceInput(results: Record<string, boolean>, id = "attempt-practice") {
  return {
    ...input(results, id),
    attemptType: "targeted_practice" as const,
  };
}

function existing(
  questionIds: string[],
  overrides: Partial<MissedQuestionsSuggestion> = {},
): MissedQuestionsSuggestion {
  const questionFailureCounts: Record<string, number> = {};
  for (const questionId of questionIds) questionFailureCounts[questionId] = 1;
  return {
    type: "missed_questions",
    courseId: COURSE_ID,
    sourceDocKey: SOURCE_DOC_KEY,
    quizId: QUIZ_ID,
    questionIds: [...questionIds],
    questionFailureCounts,
    status: "active",
    priority: questionIds.length,
    linkedTaskId: null,
    sourceAttemptId: "attempt-0",
    ...overrides,
  };
}

function suggestionWithFailures(
  counts: Record<string, number>,
  overrides: Partial<MissedQuestionsSuggestion> = {},
): MissedQuestionsSuggestion {
  return existing(Object.keys(counts), {
    questionFailureCounts: { ...counts },
    priority: 0,
    ...overrides,
  });
}

describe("reconcileMissedQuestions", () => {
  it("creates a suggestion after the first miss", () => {
    const next = reconcileMissedQuestions(null, input({ q1: false, q2: true }));
    expect(next.questionIds).toEqual(["q1"]);
    expect(next.questionFailureCounts.q1).toBe(1);
    expect(next.status).toBe("active");
    expect(next.type).toBe("missed_questions");
    expect(next.courseId).toBe(COURSE_ID);
    expect(next.quizId).toBe(QUIZ_ID);
    expect(next.sourceDocKey).toBe(SOURCE_DOC_KEY);
    expect(next.sourceAttemptId).toBe("attempt-1");
    expect(next.linkedTaskId).toBeNull();
    expect(next.priority).toBe(1);
  });

  it("returns the existing suggestion unchanged when the attempt was already applied", () => {
    const attempt = input({ q1: false, q2: false }, "same-attempt");
    const created = reconcileMissedQuestions(null, attempt);
    const again = reconcileMissedQuestions(created, attempt);
    expect(again).toBe(created);
    expect(again.questionFailureCounts.q1).toBe(1);
    expect(again.questionIds).toEqual(["q1", "q2"]);
  });

  it("increments a failure count once per attempt on either attempt type", () => {
    const afterFull = reconcileMissedQuestions(null, input({ q1: false }, "full"));
    const afterPractice = reconcileMissedQuestions(
      afterFull,
      practiceInput({ q1: false }, "practice"),
    );
    expect(afterFull.questionFailureCounts.q1).toBe(1);
    expect(afterPractice.questionFailureCounts.q1).toBe(2);
    expect(afterPractice.questionIds).toEqual(["q1"]);
    expect(afterPractice.sourceAttemptId).toBe("practice");
  });

  it("adds a newly missed id without reordering questions already queued", () => {
    const next = reconcileMissedQuestions(
      existing(["q2"]),
      input({ q1: false }, "add-q1"),
    );
    expect(next.questionIds).toEqual(["q2", "q1"]);
    expect(next.questionFailureCounts.q1).toBe(1);
    expect(next.questionFailureCounts.q2).toBe(1);
  });

  it("removes corrected practice questions but keeps remaining misses", () => {
    const next = reconcileMissedQuestions(existing(["q1", "q2"]), practiceInput({ q1: true, q2: false }));
    expect(next.questionIds).toEqual(["q2"]);
    expect(next.questionFailureCounts.q2).toBe(2);
  });

  it("removes questions answered correctly on a full quiz and keeps questions the attempt did not include", () => {
    const start = existing(["q1", "q2", "q3"], {
      questionFailureCounts: { q1: 2, q2: 1, q3: 1 },
      linkedTaskId: "task-keep",
    });
    const next = reconcileMissedQuestions(
      start,
      input({ q1: true, q3: false }, "full-2"),
    );
    expect(next.questionIds).toEqual(["q2", "q3"]);
    expect(next.questionFailureCounts.q1).toBe(2);
    expect(next.questionFailureCounts.q3).toBe(2);
    expect(next.courseId).toBe(COURSE_ID);
    expect(next.quizId).toBe(QUIZ_ID);
    expect(next.sourceDocKey).toBe(SOURCE_DOC_KEY);
    expect(next.linkedTaskId).toBe("task-keep");
  });

  it("resolves an empty queue and preserves linkedTaskId", () => {
    const start = existing(["q1"], {
      status: "added",
      linkedTaskId: "task-9",
      questionFailureCounts: { q1: 4 },
    });
    const next = reconcileMissedQuestions(start, practiceInput({ q1: true }, "fixed"));
    expect(next.questionIds).toEqual([]);
    expect(next.status).toBe("resolved");
    expect(next.linkedTaskId).toBe("task-9");
    expect(next.priority).toBe(0);
    expect(next.questionFailureCounts.q1).toBe(4);
  });

  it("resolves a first attempt that has no misses", () => {
    const next = reconcileMissedQuestions(null, input({ q1: true }, "perfect"));
    expect(next.questionIds).toEqual([]);
    expect(next.status).toBe("resolved");
    expect(next.priority).toBe(0);
    expect(next.linkedTaskId).toBeNull();
  });

  it("reactivates a dismissed suggestion when a newer attempt adds a miss", () => {
    const next = reconcileMissedQuestions(
      existing(["q1"], { status: "dismissed" }),
      input({ q2: false }, "new-miss"),
    );
    expect(next.status).toBe("active");
    expect(next.questionIds).toEqual(["q1", "q2"]);
  });

  it("reactivates a dismissed suggestion when a newer attempt increments a failure count", () => {
    const next = reconcileMissedQuestions(
      existing(["q1"], { status: "dismissed", questionFailureCounts: { q1: 1 } }),
      practiceInput({ q1: false }, "again"),
    );
    expect(next.status).toBe("active");
    expect(next.questionFailureCounts.q1).toBe(2);
  });

  it("keeps a dismissed suggestion dismissed when the attempt only removes corrected ids", () => {
    const next = reconcileMissedQuestions(
      existing(["q1", "q2"], { status: "dismissed" }),
      input({ q1: true }, "correct-one"),
    );
    expect(next.questionIds).toEqual(["q2"]);
    expect(next.status).toBe("dismissed");
  });

  it("resolves a dismissed suggestion when the queue becomes empty", () => {
    const next = reconcileMissedQuestions(
      existing(["q1"], { status: "dismissed", linkedTaskId: "task-d" }),
      input({ q1: true }, "clear-dismissed"),
    );
    expect(next.questionIds).toEqual([]);
    expect(next.status).toBe("resolved");
    expect(next.linkedTaskId).toBe("task-d");
  });

  it("does not reactivate a dismissed suggestion when the same attempt is replayed", () => {
    const start = existing(["q1"], {
      status: "dismissed",
      sourceAttemptId: "same",
      questionFailureCounts: { q1: 1 },
    });
    const next = reconcileMissedQuestions(start, input({ q1: false, q2: false }, "same"));
    expect(next).toBe(start);
    expect(next.status).toBe("dismissed");
    expect(next.questionFailureCounts.q1).toBe(1);
  });

  it("keeps an added suggestion added and does not clear linkedTaskId", () => {
    const next = reconcileMissedQuestions(
      existing(["q1", "q2"], { status: "added", linkedTaskId: "task-9" }),
      input({ q1: false, q3: false }, "still-added"),
    );
    expect(next.status).toBe("added");
    expect(next.linkedTaskId).toBe("task-9");
    expect(next.questionIds).toEqual(["q1", "q2", "q3"]);
    expect(next.questionFailureCounts.q1).toBe(2);
  });

  it("keeps an added suggestion added when corrected ids leave a non-empty queue", () => {
    const next = reconcileMissedQuestions(
      existing(["q1", "q2"], { status: "added", linkedTaskId: "task-9" }),
      practiceInput({ q1: true }, "partial-fix"),
    );
    expect(next.status).toBe("added");
    expect(next.questionIds).toEqual(["q2"]);
    expect(next.linkedTaskId).toBe("task-9");
  });

  it("returns an added suggestion to active when linkedTaskId is null and the queue is non-empty", () => {
    const next = reconcileMissedQuestions(
      existing(["q1"], { status: "added", linkedTaskId: null }),
      input({ q1: false }, "unlinked-added"),
    );
    expect(next.status).toBe("active");
    expect(next.questionIds).toEqual(["q1"]);
    expect(next.linkedTaskId).toBeNull();
  });

  it("reopens a resolved suggestion when a later attempt misses again", () => {
    const resolved = existing([], {
      status: "resolved",
      questionFailureCounts: { q1: 2 },
    });
    const next = reconcileMissedQuestions(resolved, input({ q1: false }, "relapse"));
    expect(next.status).toBe("active");
    expect(next.questionIds).toEqual(["q1"]);
    expect(next.questionFailureCounts.q1).toBe(3);
    expect(next.priority).toBe(1 + 2 * 2);
  });

  it("stores the computed priority on the suggestion", () => {
    const first = reconcileMissedQuestions(null, input({ q1: false }, "first"));
    const repeat = reconcileMissedQuestions(first, input({ q1: false }, "second"));
    expect(first.priority).toBe(computeSuggestionPriority(first));
    expect(repeat.priority).toBe(computeSuggestionPriority(repeat));
    expect(repeat.priority).toBeGreaterThan(first.priority);
  });
});

describe("selectPracticeQuestionIds", () => {
  it("prioritizes repeat misses and limits a task to ten", () => {
    const suggestion = suggestionWithFailures({ q1: 3, q2: 2, q3: 1, q4: 1, q5: 1, q6: 1, q7: 1, q8: 1, q9: 1, q10: 1, q11: 1 });
    expect(selectPracticeQuestionIds(suggestion, 10)).toEqual(["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10"]);
  });

  it("keeps existing order when failure counts are equal", () => {
    const suggestion = suggestionWithFailures({ qB: 2, qA: 2, qC: 5 });
    expect(suggestion.questionIds).toEqual(["qB", "qA", "qC"]);
    expect(selectPracticeQuestionIds(suggestion)).toEqual(["qC", "qB", "qA"]);
  });

  it("defaults the limit to ten", () => {
    const counts: Record<string, number> = {};
    for (let index = 1; index <= 11; index += 1) counts[`q${index}`] = 1;
    const suggestion = suggestionWithFailures(counts);
    expect(selectPracticeQuestionIds(suggestion)).toEqual(
      Object.keys(counts).slice(0, 10),
    );
  });

  it("does not mutate the suggestion queue", () => {
    const suggestion = suggestionWithFailures({ q1: 1, q2: 3 });
    const before = [...suggestion.questionIds];
    selectPracticeQuestionIds(suggestion, 1);
    expect(suggestion.questionIds).toEqual(before);
  });
});

describe("computeSuggestionPriority", () => {
  it("scores a repeat miss higher than a first-time miss", () => {
    const first = suggestionWithFailures({ q1: 1 });
    const repeat = suggestionWithFailures({ q1: 2 });
    expect(computeSuggestionPriority(first)).toBe(1);
    expect(computeSuggestionPriority(repeat)).toBe(3);
    expect(computeSuggestionPriority(repeat)).toBeGreaterThan(
      computeSuggestionPriority(first),
    );
  });

  it("counts queued questions plus twice each repeat beyond the first miss", () => {
    expect(computeSuggestionPriority(suggestionWithFailures({ q1: 1, q2: 1 }))).toBe(2);
    expect(computeSuggestionPriority(suggestionWithFailures({ q1: 3, q2: 2 }))).toBe(
      2 + 2 * (2 + 1),
    );
  });

  it("ignores failure counts for ids that are no longer queued", () => {
    const suggestion = suggestionWithFailures({ q1: 2 });
    suggestion.questionFailureCounts.q9 = 9;
    expect(computeSuggestionPriority(suggestion)).toBe(3);
  });

  it("returns 0 for a resolved or empty queue", () => {
    expect(computeSuggestionPriority(existing([]))).toBe(0);
    expect(computeSuggestionPriority(existing(["q1"], {
      status: "resolved",
      questionFailureCounts: { q1: 4 },
    }))).toBe(0);
  });
});

describe("filterAvailableQuestions", () => {
  it("marks a suggestion unavailable when every referenced question is missing", () => {
    expect(filterAvailableQuestions(existing(["deleted"]), new Set()).status).toBe("unavailable");
  });

  it("drops ids that are not available and does not crash on an empty set", () => {
    const suggestion = existing(["q1", "deleted", "q2"], { linkedTaskId: "task-f" });
    const filtered = filterAvailableQuestions(suggestion, new Set(["q2", "q1"]));
    expect(filtered.questionIds).toEqual(["q1", "q2"]);
    expect(filtered.status).toBe("active");
    expect(filtered.linkedTaskId).toBe("task-f");
    expect(suggestion.questionIds).toEqual(["q1", "deleted", "q2"]);

    const none = filterAvailableQuestions(suggestion, new Set());
    expect(none.questionIds).toEqual([]);
    expect(none.status).toBe("unavailable");
    expect(none.priority).toBe(0);
    expect(none.linkedTaskId).toBe("task-f");
  });

  it("leaves an empty queue status unchanged when nothing was referenced", () => {
    const suggestion = existing([], { status: "resolved" });
    const filtered = filterAvailableQuestions(suggestion, new Set());
    expect(filtered.questionIds).toEqual([]);
    expect(filtered.status).toBe("resolved");
  });

  it("keeps a partial filter on a dismissed suggestion dismissed", () => {
    const filtered = filterAvailableQuestions(
      existing(["q1", "q2"], { status: "dismissed" }),
      new Set(["q2"]),
    );
    expect(filtered.questionIds).toEqual(["q2"]);
    expect(filtered.status).toBe("dismissed");
  });

  it("stores priority for the questions that remain", () => {
    const filtered = filterAvailableQuestions(
      suggestionWithFailures({ q1: 3, q2: 1 }),
      new Set(["q2"]),
    );
    expect(filtered.questionIds).toEqual(["q2"]);
    expect(filtered.priority).toBe(computeSuggestionPriority(filtered));
    expect(filtered.priority).toBe(1);
  });
});
