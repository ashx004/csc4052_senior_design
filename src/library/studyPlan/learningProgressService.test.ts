import { describe, expect, it } from "vitest";
import { computeDocumentMastery } from "./masteryEngine";
import type { ConceptSessionEvidence } from "./conceptMasteryEngine";
import type { FocusedSessionRepository } from "./conceptWeakSpotRepository";
import type {
  ApplyQuizOutcomeInput,
  LearningProgressRepository,
} from "./learningProgressRepository";
import {
  finishFlashcardReview,
  finishReading,
  processSavedAttempt,
  recordNamedMisses,
  retryPendingAttempts,
  submitQuizResult,
  type SubmitQuizResultInput,
} from "./learningProgressService";
import type {
  ConceptWeakSpot,
  NewLearningActivityEvent,
  NewQuizAttempt,
  PendingAttemptRef,
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
  appliedOutcomes: ApplyQuizOutcomeInput[];
  savedSpots: ConceptWeakSpot[][];
  activityEvents: NewLearningActivityEvent[];
  pendingLimit: number | null;
  conceptSessions: ConceptSessionEvidence[];
  conceptMasteryWrites: { conceptKey: string; value: number }[];
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

function weakSpot(overrides: Partial<ConceptWeakSpot> = {}): ConceptWeakSpot {
  return {
    courseId: COURSE_ID,
    conceptKey: "chain rule",
    label: "Chain Rule",
    misses: [{ questionId: "q8", quizId: QUIZ_ID, failureCount: 1 }],
    sourceDocKeys: [SOURCE_DOC_KEY],
    status: "open",
    openedAtMs: 1,
    retiredAtMs: null,
    timesReopened: 0,
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
  concepts?: Record<string, string>;
  existingSpots?: ConceptWeakSpot[];
  applyErrorTimes?: number;
  /** Throws from applyQuizOutcome the first N times it carries concept sessions, before writing anything. */
  conceptSessionErrorTimes?: number;
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
  const spotStore = [...(options.existingSpots ?? [])];
  let conceptSessionErrorsLeft = options.conceptSessionErrorTimes ?? 0;
  let applyErrorsLeft = options.applyErrorTimes ?? Number.POSITIVE_INFINITY;
  const applyResults = [...(options.applyResults ?? [])];
  const sourceDocKey = options.sourceDocKey === undefined ? SOURCE_DOC_KEY : options.sourceDocKey;
  const conceptSessions: ConceptSessionEvidence[] = [];
  const conceptMasteryWrites: { conceptKey: string; value: number }[] = [];
  const processedAttemptIds = new Set<string>();
  const namedMissAttemptIds = new Set<string>();
  const conceptWeakSpots: FocusedSessionRepository = {
    async listAll(courseId) {
      repo.calls.push("conceptWeakSpots.listAll");
      return spotStore.filter((spot) => spot.courseId === courseId);
    },
    async listOpen(courseId) {
      return spotStore.filter((spot) => spot.courseId === courseId && spot.status === "open");
    },
    async save() {
      throw new Error("the service must write weak spots through applyQuizOutcome");
    },
    async listConceptSessions(_courseId, conceptKeys) {
      return conceptSessions.filter((row) => conceptKeys.includes(row.conceptKey));
    },
    async saveConceptSessions() {
      throw new Error("the service must write concept sessions through applyQuizOutcome");
    },
    async saveConceptMastery() {
      throw new Error("the service must write concept mastery through applyQuizOutcome");
    },
  };
  const repo: FakeRepository = {
    conceptWeakSpots,
    calls: [],
    failedAttemptIds: [],
    failureMessages: [],
    outcomeWrites: 0,
    applyCalls: 0,
    createdAttempts: [],
    appliedOutcomes: [],
    savedSpots: [],
    activityEvents: [],
    pendingLimit: null,
    conceptSessions,
    conceptMasteryWrites,
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
    async getQuizQuestionConcepts() {
      repo.calls.push("getQuizQuestionConcepts");
      return options.concepts ?? {};
    },
    async applyQuizOutcome(input) {
      repo.calls.push("applyQuizOutcome");
      repo.applyCalls += 1;
      options.onApply?.();
      if (options.applyError && applyErrorsLeft-- > 0) throw options.applyError;
      if ((input.conceptSessions ?? []).length > 0 && conceptSessionErrorsLeft-- > 0) {
        throw new Error("concept session write failed");
      }
      const result = applyResults.length > 0 ? applyResults.shift()! : "processed";
      if (result === "processed") {
        repo.outcomeWrites += 1;
        repo.appliedOutcomes.push(input);
        const spots = input.conceptWeakSpots ?? [];
        if (spots.length > 0) repo.savedSpots.push(spots);
        for (const spot of spots) {
          const index = spotStore.findIndex(
            (item) => item.courseId === spot.courseId && item.conceptKey === spot.conceptKey,
          );
          if (index >= 0) spotStore[index] = spot;
          else spotStore.push(spot);
        }
        conceptSessions.push(...(input.conceptSessions ?? []));
        conceptMasteryWrites.push(...(input.conceptMastery ?? []));
        const index = pending.findIndex((ref) => ref.attemptId === input.attemptId);
        if (index >= 0) pending.splice(index, 1);
        processedAttemptIds.add(input.attemptId);
      }
      return result ?? "processed";
    },
    async applyNamedMisses(input) {
      repo.calls.push("applyNamedMisses");
      if (!processedAttemptIds.has(input.attemptId)) return "not_processed";
      if (namedMissAttemptIds.has(input.attemptId)) return "already_recorded";
      namedMissAttemptIds.add(input.attemptId);
      repo.savedSpots.push(input.weakSpots);
      for (const spot of input.weakSpots) {
        const index = spotStore.findIndex(
          (item) => item.courseId === spot.courseId && item.conceptKey === spot.conceptKey,
        );
        if (index >= 0) spotStore[index] = spot;
        else spotStore.push(spot);
      }
      return "recorded";
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
    expect(repo.calls.indexOf("createQuizAttempt")).toBeLessThan(
      repo.calls.indexOf("conceptWeakSpots.listAll"),
    );
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
    expect(result.suggestion).toBeNull();
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
    expect(repo.appliedOutcomes[0].sourceDocKey).toBe(SOURCE_DOC_KEY);
    expect(repo.appliedOutcomes[0]).not.toHaveProperty("suggestion");
    expect(repo.outcomeWrites).toBe(1);
  });

  it("opens weak spots for tagged misses and stamps the course id before saving", async () => {
    const repo = fakeRepository({
      concepts: { q8: "Chain Rule", q9: "Chain Rule", q10: "Product Rule" },
    });

    await submitQuizResult(repo, fullQuizInput());

    expect(repo.savedSpots).toHaveLength(1);
    const saved = repo.savedSpots[0];
    expect(saved.map((spot) => spot.courseId)).toEqual([COURSE_ID, COURSE_ID]);
    const chain = saved.find((spot) => spot.label === "Chain Rule");
    expect(chain?.status).toBe("open");
    expect(chain?.misses.map((miss) => miss.questionId)).toEqual(["q8", "q9"]);
    expect(chain?.sourceDocKeys).toEqual([SOURCE_DOC_KEY]);
    expect(saved.find((spot) => spot.label === "Product Rule")?.misses).toHaveLength(1);
  });

  it("updates an existing weak spot and saves only the spots the attempt touched", async () => {
    const touched = weakSpot();
    const untouched = weakSpot({
      conceptKey: "limits",
      label: "Limits",
      misses: [{ questionId: "q99", quizId: "other", failureCount: 1 }],
    });
    const repo = fakeRepository({
      concepts: { q8: "Chain Rule" },
      existingSpots: [touched, untouched],
    });

    await submitQuizResult(repo, fullQuizInput());

    expect(repo.savedSpots).toHaveLength(1);
    expect(repo.savedSpots[0]).toHaveLength(1);
    expect(repo.savedSpots[0][0]).toMatchObject({
      courseId: COURSE_ID,
      conceptKey: "chain rule",
      misses: [{ questionId: "q8", quizId: QUIZ_ID, failureCount: 2 }],
    });
  });

  it("scores the attempt against the concepts it just opened", async () => {
    const repo = fakeRepository({
      concepts: { q8: "Chain Rule", q1: "Product Rule" },
    });

    await submitQuizResult(repo, fullQuizInput());

    expect(repo.conceptSessions.map((row) => [row.conceptKey, row.percent, row.kind]).sort()).toEqual([
      ["chain rule", 0, "quiz"],
    ]);
  });

  it("retires an open weak spot that this attempt's score clears", async () => {
    const repo = fakeRepository({
      concepts: { q1: "Chain Rule", q2: "Chain Rule", q3: "Chain Rule" },
      existingSpots: [weakSpot()],
    });

    await submitQuizResult(repo, fullQuizInput());

    expect(repo.savedSpots).toHaveLength(1);
    expect(repo.savedSpots[0][0]).toMatchObject({ conceptKey: "chain rule", status: "retired" });
    expect(repo.conceptMasteryWrites).toEqual([
      expect.objectContaining({ conceptKey: "chain rule", value: 100 }),
    ]);
  });

  it("does not raise failureCount again when it scores the focused session", async () => {
    const repo = fakeRepository({
      concepts: { q8: "Chain Rule" },
      existingSpots: [weakSpot()],
    });

    await submitQuizResult(repo, fullQuizInput());

    const spots = await repo.conceptWeakSpots.listAll(COURSE_ID);
    expect(spots[0].misses).toEqual([{ questionId: "q8", quizId: QUIZ_ID, failureCount: 2 }]);
    expect(repo.applyCalls).toBe(1);
  });

  it("skips the focused session when the attempt was already processed", async () => {
    const repo = fakeRepository({
      concepts: { q8: "Chain Rule" },
      applyResults: ["already_processed"],
    });

    await submitQuizResult(repo, fullQuizInput());

    expect(repo.conceptSessions).toEqual([]);
  });

  it("keeps the attempt pending when the focused-session save throws, then retires once on retry without raising failureCount", async () => {
    // q1-q4 and q8 are Chain Rule: 4 of 5 right is 80%, which retires an open spot.
    const repo = fakeRepository({
      concepts: { q1: "Chain Rule", q2: "Chain Rule", q3: "Chain Rule", q4: "Chain Rule", q8: "Chain Rule" },
      existingSpots: [weakSpot()],
      conceptSessionErrorTimes: 1,
    });

    const first = await submitQuizResult(repo, fullQuizInput());

    expect(repo.failedAttemptIds).toEqual([first.attemptId]);
    expect(await repo.listPendingAttempts(10)).toEqual([pendingAttempt(first.attemptId)]);
    const afterFailure = await repo.conceptWeakSpots.listAll(COURSE_ID);
    expect(afterFailure[0]).toMatchObject({ status: "open", retiredAtMs: null });
    expect(afterFailure[0].misses).toEqual([{ questionId: "q8", quizId: QUIZ_ID, failureCount: 1 }]);
    expect(repo.conceptSessions).toEqual([]);
    expect(repo.conceptMasteryWrites).toEqual([]);

    await retryPendingAttempts(repo, 10);

    const spots = await repo.conceptWeakSpots.listAll(COURSE_ID);
    expect(spots).toHaveLength(1);
    expect(spots[0]).toMatchObject({ status: "retired" });
    expect(spots[0].misses).toEqual([{ questionId: "q8", quizId: QUIZ_ID, failureCount: 2 }]);
    expect(repo.outcomeWrites).toBe(1);
    expect(repo.savedSpots).toHaveLength(1);
    expect(repo.conceptSessions).toHaveLength(1);
    expect(await repo.listPendingAttempts(10)).toEqual([]);

    await retryPendingAttempts(repo, 10);
    expect(repo.savedSpots).toHaveLength(1);
    expect(repo.conceptSessions).toHaveLength(1);
  });

  it("does not write weak spots when no question has a concept", async () => {
    const repo = fakeRepository();

    await submitQuizResult(repo, fullQuizInput());

    expect(repo.savedSpots).toEqual([]);
    expect(repo.appliedOutcomes[0].conceptWeakSpots).toEqual([]);
    expect(repo.outcomeWrites).toBe(1);
  });

  it("does not raise failureCount when the same attempt is processed again after apply fails", async () => {
    const repo = fakeRepository({
      concepts: { q8: "Chain Rule" },
      applyError: new Error("offline"),
      applyErrorTimes: 1,
    });

    const first = await submitQuizResult(repo, fullQuizInput());

    expect(repo.failedAttemptIds).toEqual([first.attemptId]);
    expect(await repo.conceptWeakSpots.listAll(COURSE_ID)).toEqual([]);

    await processSavedAttempt(repo, pendingAttempt(first.attemptId));

    const spots = await repo.conceptWeakSpots.listAll(COURSE_ID);
    expect(spots).toHaveLength(1);
    expect(spots[0].misses).toEqual([{ questionId: "q8", quizId: QUIZ_ID, failureCount: 1 }]);
    expect(repo.outcomeWrites).toBe(1);
  });

  it("does not raise failureCount when apply reports the attempt already processed", async () => {
    const repo = fakeRepository({
      concepts: { q8: "Chain Rule" },
      applyResults: ["processed", "already_processed"],
    });

    const first = await submitQuizResult(repo, fullQuizInput());
    await processSavedAttempt(repo, pendingAttempt(first.attemptId));

    const spots = await repo.conceptWeakSpots.listAll(COURSE_ID);
    expect(spots[0].misses[0].failureCount).toBe(1);
  });

  it("still completes a linked task when every answer is wrong", async () => {
    const input = fullQuizInput();
    for (const question of input.questions) input.answers[question.id] = "B";
    const repo = fakeRepository();

    const result = await submitQuizResult(repo, input);

    expect(result.score).toBe(0);
    expect(result.taskShouldComplete).toBe(true);
    expect(result.suggestion).toBeNull();
  });

  it("leaves task completion false when the quiz has no task", async () => {
    const repo = fakeRepository();

    const result = await submitQuizResult(repo, { ...fullQuizInput(), taskId: null });

    expect(result.taskShouldComplete).toBe(false);
    expect(repo.appliedOutcomes[0].taskId).toBeNull();
  });

  it("does not read evidence without a source document", async () => {
    const repo = fakeRepository({ sourceDocKey: null });

    await submitQuizResult(repo, fullQuizInput());

    expect(repo.calls).not.toContain("listFullAttemptEvidence");
    expect(repo.appliedOutcomes[0].mastery).toBeNull();
    expect(repo.appliedOutcomes[0].sourceDocKey).toBeNull();
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
    expect(result.suggestion).toBeNull();
    expect(result.score).toBe(1);
    expect(repo.createdAttempts[0].sourceSuggestionId).toBe("existing-suggestion");
    expect(repo.createdAttempts[0].attemptType).toBe("targeted_practice");
  });

  it("records misses on a Retry Wrong Answers attempt but never retires from it", async () => {
    const repo = fakeRepository({
      concepts: { q1: "Chain Rule", q2: "Chain Rule", q3: "Chain Rule", q4: "Product Rule" },
      existingSpots: [weakSpot()],
    });
    const input: SubmitQuizResultInput = {
      ...fullQuizInput(),
      attemptType: "targeted_practice",
      questions: ["q1", "q2", "q3", "q4"].map((id) => ({ id, correctAnswer: "A" })),
      answers: { q1: "A", q2: "A", q3: "A", q4: "B" },
    };

    await submitQuizResult(repo, input);

    const saved = repo.savedSpots.flat();
    expect(saved.some((spot) => spot.status === "retired")).toBe(false);
    expect(saved.find((spot) => spot.conceptKey === "product rule")?.misses).toEqual([
      { questionId: "q4", quizId: QUIZ_ID, failureCount: 1 },
    ]);
    expect(repo.conceptSessions).toEqual([]);
    expect(repo.conceptMasteryWrites).toEqual([]);
  });

  it("still retires from a fresh full focused quiz on the same concept", async () => {
    const repo = fakeRepository({
      concepts: { q1: "Chain Rule", q2: "Chain Rule", q3: "Chain Rule" },
      existingSpots: [weakSpot()],
    });

    await submitQuizResult(repo, fullQuizInput());

    expect(repo.savedSpots.flat().find((spot) => spot.conceptKey === "chain rule")?.status).toBe("retired");
  });
});

describe("recordNamedMisses", () => {
  it("records newly named misses once per attempt", async () => {
    const repo = fakeRepository();
    const { attemptId } = await submitQuizResult(repo, fullQuizInput());
    expect(repo.savedSpots).toEqual([]);

    const labels = { q8: "Chain Rule", q9: "Chain Rule" };
    const first = await recordNamedMisses(repo, { courseId: COURSE_ID, quizId: QUIZ_ID, attemptId, labels });
    const second = await recordNamedMisses(repo, { courseId: COURSE_ID, quizId: QUIZ_ID, attemptId, labels });

    expect(first).toBe("recorded");
    expect(second).toBe("already_recorded");
    expect(repo.savedSpots).toHaveLength(1);
    expect(repo.savedSpots[0]).toEqual([
      expect.objectContaining({
        courseId: COURSE_ID,
        conceptKey: "chain rule",
        status: "open",
        sourceDocKeys: [SOURCE_DOC_KEY],
        misses: [
          { questionId: "q8", quizId: QUIZ_ID, failureCount: 1 },
          { questionId: "q9", quizId: QUIZ_ID, failureCount: 1 },
        ],
      }),
    ]);
  });

  it("ignores labels for questions the student answered correctly", async () => {
    const repo = fakeRepository();
    const { attemptId } = await submitQuizResult(repo, fullQuizInput());

    const status = await recordNamedMisses(repo, {
      courseId: COURSE_ID,
      quizId: QUIZ_ID,
      attemptId,
      labels: { q1: "Chain Rule" },
    });

    expect(status).toBe("nothing_to_record");
    expect(repo.calls).not.toContain("applyNamedMisses");
  });

  it("leaves a pending attempt for processing to pick up", async () => {
    const repo = fakeRepository({ applyError: new Error("offline") });
    const { attemptId } = await submitQuizResult(repo, fullQuizInput());

    const status = await recordNamedMisses(repo, {
      courseId: COURSE_ID,
      quizId: QUIZ_ID,
      attemptId,
      labels: { q8: "Chain Rule" },
    });

    expect(status).toBe("not_processed");
    expect(repo.savedSpots).toEqual([]);
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

  it("computes mastery from every stored full-quiz attempt for the document", async () => {
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
      priorEvidence: [baseline],
      seededAttempts: [
        seededAttempt("old-1", 100, [missed], 0),
        seededAttempt("new-1", 300, [corrected], 1),
      ],
    });

    await processSavedAttempt(repo, pendingAttempt("old-1"));

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
