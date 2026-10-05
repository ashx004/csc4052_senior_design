import { describe, expect, it } from "vitest";
import { learningSuggestionId } from "./firestorePaths";
import { computeDocumentMastery } from "./masteryEngine";
import type { LearningProgressRepository } from "./learningProgressRepository";
import {
  finishFlashcardReview,
  finishReading,
  processSavedAttempt,
  retryPendingAttempts,
  submitQuizResult,
  type SubmitQuizResultInput,
} from "./learningProgressService";
import type {
  MissedQuestionsSuggestion,
  NewLearningActivityEvent,
  NewQuizAttempt,
  PendingAttemptRef,
  PersistQuizOutcomeInput,
  QuizAttemptEvidence,
  QuizQuestionResult,
} from "./types";

const COURSE_ID = "course-1";
const QUIZ_ID = "quiz-1";
const SOURCE_DOC_KEY = "doc-key";

interface StoredAttempt extends NewQuizAttempt {
  id: string;
  completedAtMs: number;
}

interface FakeRepository extends LearningProgressRepository {
  calls: string[];
  failedAttemptIds: string[];
  failureMessages: string[];
  outcomeWrites: number;
  applyCalls: number;
  createdAttempts: NewQuizAttempt[];
  appliedOutcomes: PersistQuizOutcomeInput[];
  activityEvents: NewLearningActivityEvent[];
  pendingLimit: number | null;
}

function fullQuizInput(): SubmitQuizResultInput {
  const questions = Array.from({ length: 10 }, (_, index) => ({
    id: `q${index + 1}`,
    correctAnswer: "A",
  }));
  const answers = Object.fromEntries(
    questions.map((question, index) => [question.id, index < 7 ? "A" : "B"]),
  );
  return {
    courseId: COURSE_ID,
    quizId: QUIZ_ID,
    attemptType: "full_quiz",
    taskId: "task-1",
    suggestionId: null,
    answers,
    questions,
  };
}

function pendingAttempt(attemptId: string): PendingAttemptRef {
  return { courseId: COURSE_ID, quizId: QUIZ_ID, attemptId };
}

function suggestion(
  overrides: Partial<MissedQuestionsSuggestion & { id: string }> = {},
): MissedQuestionsSuggestion & { id: string } {
  return {
    type: "missed_questions",
    courseId: COURSE_ID,
    sourceDocKey: SOURCE_DOC_KEY,
    quizId: QUIZ_ID,
    questionIds: ["q8"],
    questionFailureCounts: { q8: 1 },
    status: "active",
    priority: 1,
    linkedTaskId: null,
    sourceAttemptId: "older-attempt",
    id: "existing-suggestion",
    ...overrides,
  };
}

function fakeRepository(options: {
  onCreateAttempt?: () => void;
  onApply?: () => void;
  applyError?: Error;
  createError?: Error;
  applyResults?: Array<"processed" | "already_processed">;
  sourceDocKey?: string | null;
  fullQuizQuestionCount?: number;
  existingSuggestion?: (MissedQuestionsSuggestion & { id: string }) | null;
  priorEvidence?: QuizAttemptEvidence[];
  pending?: PendingAttemptRef[];
  seededAttempts?: StoredAttempt[];
} = {}): FakeRepository {
  const attempts = new Map<string, StoredAttempt>();
  for (const attempt of options.seededAttempts ?? []) {
    attempts.set(attemptKey(attempt.courseId, attempt.quizId, attempt.id), attempt);
  }
  const pending = [...(options.pending ?? [])];
  let nextId = 0;
  let nextEventId = 0;
  let clock = 1_000;
  let suggestionState = options.existingSuggestion ?? null;
  const applyResults = [...(options.applyResults ?? [])];
  const sourceDocKey = options.sourceDocKey === undefined ? SOURCE_DOC_KEY : options.sourceDocKey;
  const repo: FakeRepository = {
    calls: [],
    failedAttemptIds: [],
    failureMessages: [],
    outcomeWrites: 0,
    applyCalls: 0,
    createdAttempts: [],
    appliedOutcomes: [],
    activityEvents: [],
    pendingLimit: null,
    async createQuizAttempt(input) {
      repo.calls.push("createQuizAttempt");
      options.onCreateAttempt?.();
      if (options.createError) throw options.createError;
      const id = `attempt-${++nextId}`;
      attempts.set(attemptKey(input.courseId, input.quizId, id), {
        ...input,
        id,
        completedAtMs: clock++,
      });
      pending.push({ courseId: input.courseId, quizId: input.quizId, attemptId: id });
      repo.createdAttempts.push(input);
      return id;
    },
    async getQuizAttempt(courseId, quizId, attemptId) {
      repo.calls.push("getQuizAttempt");
      const stored = attempts.get(attemptKey(courseId, quizId, attemptId));
      return toStoredAttempt(stored ?? syntheticAttempt(attemptId));
    },
    async getQuizContext() {
      repo.calls.push("getQuizContext");
      return {
        sourceDocKey,
        fullQuizQuestionCount: options.fullQuizQuestionCount ?? 10,
      };
    },
    async listFullAttemptEvidence(courseId, docKey) {
      repo.calls.push("listFullAttemptEvidence");
      if (docKey !== sourceDocKey) return [];
      const evidence = [...(options.priorEvidence ?? [])];
      for (const attempt of attempts.values()) {
        if (attempt.courseId !== courseId || attempt.attemptType !== "full_quiz") continue;
        evidence.push(toEvidence(attempt, options.fullQuizQuestionCount ?? 10));
      }
      evidence.sort((left, right) => right.completedAtMs - left.completedAtMs);
      return evidence;
    },
    async getSuggestion() {
      repo.calls.push("getSuggestion");
      return suggestionState;
    },
    async applyQuizOutcome(input) {
      repo.calls.push("applyQuizOutcome");
      repo.applyCalls += 1;
      options.onApply?.();
      if (options.applyError) throw options.applyError;
      const result = applyResults.length > 0 ? applyResults.shift()! : "processed";
      if (result === "processed") {
        repo.outcomeWrites += 1;
        repo.appliedOutcomes.push(input);
        suggestionState = {
          ...input.suggestion,
          id: suggestionState?.id ?? learningSuggestionId(input.courseId, input.quizId),
        };
        const index = pending.findIndex((ref) => ref.attemptId === input.attemptId);
        if (index >= 0) pending.splice(index, 1);
      }
      return result ?? "processed";
    },
    async recordActivityEvent(input) {
      repo.calls.push("recordActivityEvent");
      repo.activityEvents.push(input);
      return `event-${++nextEventId}`;
    },
    async markAttemptFailed(_courseId, _quizId, attemptId, message) {
      repo.calls.push("markAttemptFailed");
      repo.failedAttemptIds.push(attemptId);
      repo.failureMessages.push(message);
    },
    async listPendingAttempts(limitCount) {
      repo.calls.push("listPendingAttempts");
      repo.pendingLimit = limitCount;
      return pending.slice(0, limitCount);
    },
  };
  return repo;
}

function attemptKey(courseId: string, quizId: string, attemptId: string): string {
  return `${courseId}/${quizId}/${attemptId}`;
}

function toStoredAttempt(attempt: StoredAttempt) {
  return {
    answers: attempt.answers,
    questionResults: attempt.questionResults,
    attemptType: attempt.attemptType,
    questionIds: attempt.questionIds,
    taskId: attempt.sourceTaskId,
    suggestionId: attempt.sourceSuggestionId,
    score: attempt.score,
    total: attempt.total,
    completedAt: attempt.completedAtMs,
  };
}

function toEvidence(attempt: StoredAttempt, fullQuizQuestionCount: number): QuizAttemptEvidence {
  return {
    id: attempt.id,
    attemptType: attempt.attemptType,
    score: attempt.score,
    total: attempt.total,
    questionIds: attempt.questionIds,
    fullQuizQuestionCount,
    completedAtMs: attempt.completedAtMs,
  };
}

function syntheticAttempt(attemptId: string): StoredAttempt {
  const input = fullQuizInput();
  const questionResults = resultsFor(input);
  return {
    id: attemptId,
    courseId: input.courseId,
    quizId: input.quizId,
    answers: input.answers,
    score: questionResults.filter((result) => result.isCorrect).length,
    total: input.questions.length,
    attemptType: input.attemptType,
    questionIds: input.questions.map((question) => question.id),
    questionResults,
    sourceTaskId: input.taskId,
    sourceSuggestionId: input.suggestionId,
    completedAtMs: 1,
  };
}

function resultsFor(input: SubmitQuizResultInput): QuizQuestionResult[] {
  return input.questions.map((question) => ({
    questionId: question.id,
    selectedAnswer: input.answers[question.id] ?? "",
    correctAnswer: question.correctAnswer,
    isCorrect: input.answers[question.id] === question.correctAnswer,
  }));
}

function seededAttempt(
  id: string,
  completedAtMs: number,
  questionResults: QuizQuestionResult[],
  score: number,
): StoredAttempt {
  return {
    id,
    courseId: COURSE_ID,
    quizId: QUIZ_ID,
    answers: Object.fromEntries(
      questionResults.map((result) => [result.questionId, result.selectedAnswer]),
    ),
    score,
    total: questionResults.length,
    attemptType: "full_quiz",
    questionIds: questionResults.map((result) => result.questionId),
    questionResults,
    sourceTaskId: null,
    sourceSuggestionId: null,
    completedAtMs,
  };
}

describe("submitQuizResult", () => {
  it("saves the attempt before derived processing", async () => {
    const order: string[] = [];
    const repo = fakeRepository({
      onCreateAttempt: () => order.push("attempt"),
      onApply: () => order.push("derived"),
    });

    await submitQuizResult(repo, fullQuizInput());

    expect(order).toEqual(["attempt", "derived"]);
    expect(repo.calls.indexOf("createQuizAttempt")).toBeLessThan(repo.calls.indexOf("getQuizContext"));
    expect(repo.calls.indexOf("createQuizAttempt")).toBeLessThan(
      repo.calls.indexOf("listFullAttemptEvidence"),
    );
    expect(repo.calls.indexOf("createQuizAttempt")).toBeLessThan(repo.calls.indexOf("getSuggestion"));
  });

  it("returns the saved score when derived processing fails and marks retryable failure", async () => {
    const error = new Error("offline");
    error.stack = "Error: offline\n    at secret/stack.ts:1:1";
    const repo = fakeRepository({ applyError: error });

    const result = await submitQuizResult(repo, fullQuizInput());

    expect(result.score).toBe(7);
    expect(result.total).toBe(10);
    expect(result.suggestion).toBeNull();
    expect(result.taskShouldComplete).toBe(true);
    expect(repo.failedAttemptIds).toEqual([result.attemptId]);
    expect(repo.failureMessages).toEqual(["offline"]);
    expect(repo.outcomeWrites).toBe(0);
  });

  it("propagates a failed attempt save without completing a task", async () => {
    const repo = fakeRepository({ createError: new Error("save failed") });

    await expect(submitQuizResult(repo, fullQuizInput())).rejects.toThrow("save failed");

    expect(repo.failedAttemptIds).toEqual([]);
    expect(repo.calls).toEqual(["createQuizAttempt"]);
  });

  it("scores seven correct answers and applies mastery for the source document", async () => {
    const repo = fakeRepository();
    const input = fullQuizInput();

    const result = await submitQuizResult(repo, input);

    expect(result.score).toBe(7);
    expect(result.total).toBe(10);
    expect(result.taskShouldComplete).toBe(true);
    expect(result.suggestion).toMatchObject({
      id: learningSuggestionId(COURSE_ID, QUIZ_ID),
      questionIds: ["q8", "q9", "q10"],
      questionFailureCounts: { q8: 1, q9: 1, q10: 1 },
      sourceDocKey: SOURCE_DOC_KEY,
      sourceAttemptId: result.attemptId,
    });
    expect(repo.createdAttempts[0]).toMatchObject({
      score: 7,
      total: 10,
      attemptType: "full_quiz",
      sourceTaskId: "task-1",
      sourceSuggestionId: null,
      questionIds: input.questions.map((question) => question.id),
    });
    expect(repo.createdAttempts[0].questionResults).toEqual(resultsFor(input));
    expect(repo.appliedOutcomes[0].mastery).toMatchObject({
      value: 70,
      level: "developing",
      sourceAttemptIds: [result.attemptId],
    });
    expect(repo.appliedOutcomes[0].suggestion).not.toHaveProperty("id");
    expect(repo.outcomeWrites).toBe(1);
  });

  it("still completes a linked task when every answer is wrong", async () => {
    const input = fullQuizInput();
    for (const question of input.questions) input.answers[question.id] = "B";
    const repo = fakeRepository();

    const result = await submitQuizResult(repo, input);

    expect(result.score).toBe(0);
    expect(result.taskShouldComplete).toBe(true);
    expect(result.suggestion?.questionIds).toHaveLength(10);
  });

  it("leaves task completion false when the quiz has no task", async () => {
    const repo = fakeRepository();

    const result = await submitQuizResult(repo, { ...fullQuizInput(), taskId: null });

    expect(result.taskShouldComplete).toBe(false);
    expect(repo.appliedOutcomes[0].taskId).toBeNull();
  });

  it("uses the existing suggestion id and does not read evidence without a source document", async () => {
    const existing = suggestion();
    const repo = fakeRepository({ sourceDocKey: null, existingSuggestion: existing });

    const result = await submitQuizResult(repo, fullQuizInput());

    expect(result.suggestion?.id).toBe(existing.id);
    expect(repo.calls).not.toContain("listFullAttemptEvidence");
    expect(repo.appliedOutcomes[0].mastery).toBeNull();
    expect(repo.appliedOutcomes[0].suggestion.questionFailureCounts.q8).toBe(2);
  });

  it("keeps mastery on full-quiz evidence when the new attempt is targeted practice", async () => {
    const prior: QuizAttemptEvidence = {
      id: "full-1",
      attemptType: "full_quiz",
      score: 10,
      total: 10,
      questionIds: ["q1", "q2"],
      fullQuizQuestionCount: 10,
      completedAtMs: 50,
    };
    const repo = fakeRepository({ priorEvidence: [prior] });
    const input: SubmitQuizResultInput = {
      ...fullQuizInput(),
      attemptType: "targeted_practice",
      suggestionId: "existing-suggestion",
      questions: [
        { id: "q8", correctAnswer: "A" },
        { id: "q9", correctAnswer: "A" },
      ],
      answers: { q8: "B", q9: "A" },
    };

    const result = await submitQuizResult(repo, input);

    expect(repo.appliedOutcomes[0].mastery).toEqual(computeDocumentMastery([prior]));
    expect(repo.appliedOutcomes[0].mastery?.sourceAttemptIds).toEqual(["full-1"]);
    expect(result.suggestion?.questionIds).toEqual(["q8"]);
    expect(result.score).toBe(1);
    expect(repo.createdAttempts[0].sourceSuggestionId).toBe("existing-suggestion");
    expect(repo.createdAttempts[0].attemptType).toBe("targeted_practice");
  });
});

describe("processSavedAttempt", () => {
  it("processing the same attempt twice has one derived effect", async () => {
    const repo = fakeRepository({ applyResults: ["processed", "already_processed"] });

    await processSavedAttempt(repo, pendingAttempt("a1"));
    await processSavedAttempt(repo, pendingAttempt("a1"));

    expect(repo.outcomeWrites).toBe(1);
    expect(repo.applyCalls).toBe(2);
  });

  it("reloads the stored attempt and marks retryable failure without a stack", async () => {
    const error = new Error("offline");
    error.stack = "Error: offline\n    at secret/stack.ts:1:1";
    const repo = fakeRepository({ applyError: error });
    const input = fullQuizInput();
    const attemptId = await repo.createQuizAttempt({
      courseId: input.courseId,
      quizId: input.quizId,
      answers: input.answers,
      score: 7,
      total: 10,
      attemptType: input.attemptType,
      questionIds: input.questions.map((question) => question.id),
      questionResults: resultsFor(input),
      sourceTaskId: input.taskId,
      sourceSuggestionId: null,
    });
    repo.calls.length = 0;

    const result = await processSavedAttempt(repo, pendingAttempt(attemptId));

    expect(repo.calls[0]).toBe("getQuizAttempt");
    expect(result).toMatchObject({
      attemptId,
      score: 7,
      total: 10,
      suggestion: null,
      taskShouldComplete: true,
    });
    expect(repo.failureMessages).toEqual(["offline"]);
  });

  it("does not resurrect misses already cleared by a newer attempt", async () => {
    const missed: QuizQuestionResult = {
      questionId: "q1",
      selectedAnswer: "B",
      correctAnswer: "A",
      isCorrect: false,
    };
    const corrected: QuizQuestionResult = {
      questionId: "q1",
      selectedAnswer: "A",
      correctAnswer: "A",
      isCorrect: true,
    };
    const cleared = suggestion({
      questionIds: [],
      questionFailureCounts: { q1: 1 },
      status: "resolved",
      priority: 0,
      sourceAttemptId: "new-1",
    });
    const baseline: QuizAttemptEvidence = {
      id: "baseline",
      attemptType: "full_quiz",
      score: 10,
      total: 10,
      questionIds: ["q1"],
      fullQuizQuestionCount: 10,
      completedAtMs: 50,
    };
    const repo = fakeRepository({
      existingSuggestion: cleared,
      priorEvidence: [baseline],
      seededAttempts: [
        seededAttempt("old-1", 100, [missed], 0),
        seededAttempt("new-1", 300, [corrected], 1),
      ],
    });

    const result = await processSavedAttempt(repo, pendingAttempt("old-1"));

    expect(repo.appliedOutcomes[0].suggestion).toMatchObject({
      questionIds: [],
      questionFailureCounts: { q1: 1 },
      sourceAttemptId: "new-1",
      status: "resolved",
    });
    expect(repo.appliedOutcomes[0].suggestion).not.toHaveProperty("id");
    expect(repo.appliedOutcomes[0].mastery).toEqual(computeDocumentMastery([
      baseline,
      {
        id: "old-1",
        attemptType: "full_quiz",
        score: 0,
        total: 1,
        questionIds: ["q1"],
        fullQuizQuestionCount: 10,
        completedAtMs: 100,
      },
      {
        id: "new-1",
        attemptType: "full_quiz",
        score: 1,
        total: 1,
        questionIds: ["q1"],
        fullQuizQuestionCount: 10,
        completedAtMs: 300,
      },
    ]));
    expect(result.suggestion).toMatchObject({
      id: cleared.id,
      questionIds: [],
      sourceAttemptId: "new-1",
    });
  });
});

describe("retryPendingAttempts", () => {
  it("processes each pending ref and treats an already processed attempt as a no-op", async () => {
    const repo = fakeRepository({
      applyResults: ["processed", "already_processed"],
      pending: [pendingAttempt("a1"), pendingAttempt("a2")],
    });

    await retryPendingAttempts(repo, 5);

    expect(repo.pendingLimit).toBe(5);
    expect(repo.applyCalls).toBe(2);
    expect(repo.outcomeWrites).toBe(1);
  });
});

describe("activity completion", () => {
  it("records reading without mastery or suggestion writes", async () => {
    const repo = fakeRepository();

    const result = await finishReading(repo, {
      courseId: COURSE_ID,
      sourceDocKey: SOURCE_DOC_KEY,
      resourceId: "resource-1",
      taskId: "task-9",
    });

    expect(result).toEqual({
      eventId: "event-1",
      courseId: COURSE_ID,
      sourceDocKey: SOURCE_DOC_KEY,
      resourceId: "resource-1",
      flashcardSetId: null,
      taskId: "task-9",
    });
    expect(repo.activityEvents).toEqual([
      {
        type: "reading_finished",
        courseId: COURSE_ID,
        sourceDocKey: SOURCE_DOC_KEY,
        resourceId: "resource-1",
        flashcardSetId: null,
        sourceTaskId: "task-9",
      },
    ]);
    expect(repo.calls).toEqual(["recordActivityEvent"]);
    expect(repo.outcomeWrites).toBe(0);
  });

  it("records a flashcard review without mastery or suggestion writes", async () => {
    const repo = fakeRepository();

    const result = await finishFlashcardReview(repo, {
      courseId: COURSE_ID,
      sourceDocKey: SOURCE_DOC_KEY,
      flashcardSetId: "set-1",
      taskId: null,
    });

    expect(result).toEqual({
      eventId: "event-1",
      courseId: COURSE_ID,
      sourceDocKey: SOURCE_DOC_KEY,
      resourceId: null,
      flashcardSetId: "set-1",
      taskId: null,
    });
    expect(repo.activityEvents[0]).toMatchObject({
      type: "flashcard_review_finished",
      flashcardSetId: "set-1",
      resourceId: null,
      sourceTaskId: null,
    });
    expect(repo.outcomeWrites).toBe(0);
    expect(repo.calls).toEqual(["recordActivityEvent"]);
  });
});
