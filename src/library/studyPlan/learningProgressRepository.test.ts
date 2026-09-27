import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import {
  documentMasteryId,
  documentMasteryPath,
  learningActivityEventId,
  learningActivityEventPath,
  learningSuggestionId,
  learningSuggestionPath,
  pendingQuizAttemptPath,
  quizAttemptPath,
  quizAttemptsCollection,
  quizSetPath,
} from "./firestorePaths";
import {
  createLearningProgressRepository,
  type LearningProgressStore,
  type LearningProgressTransaction,
  type StoredDocument,
} from "./learningProgressRepository";
import type {
  MissedQuestionsSuggestion,
  NewQuizAttempt,
  PersistQuizOutcomeInput,
  QuizQuestionResult,
} from "./types";

const UID = "user-1";

function comparableMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toMillis" in value) {
    const read = (value as { toMillis?: unknown }).toMillis;
    if (typeof read === "function") {
      const millis = read.call(value);
      if (typeof millis === "number" && Number.isFinite(millis)) return millis;
    }
  }
  return 0;
}

type WriteOp = { op: "set" | "update" | "delete"; path: string; data?: Record<string, unknown> };

class MemoryStore implements LearningProgressStore {
  docs = new Map<string, Record<string, unknown>>();
  private nextId = 0;
  transactionWriteSets: WriteOp[][] = [];
  batches: string[][] = [];
  failNextBatch = false;
  failOrderedReads = false;
  orderedQueries: Array<{
    path: string;
    field: string;
    direction: "asc" | "desc";
    limitCount: number;
  }> = [];
  limitedReads: Array<{ path: string; limitCount: number }> = [];
  readonly stamp = { __serverTimestamp: true };

  serverTimestamp(): unknown {
    return this.stamp;
  }

  async addDoc(collectionPath: string, data: Record<string, unknown>): Promise<string> {
    const id = await this.newId();
    this.docs.set(`${collectionPath}/${id}`, { ...data });
    return id;
  }

  async newId(): Promise<string> {
    return `auto-${++this.nextId}`;
  }

  async commitBatch(writes: Array<{ path: string; data: Record<string, unknown> }>): Promise<void> {
    if (this.failNextBatch) {
      this.failNextBatch = false;
      throw new Error("batch failed");
    }
    const snapshot = new Map(this.docs);
    try {
      for (const write of writes) {
        this.docs.set(write.path, { ...write.data });
      }
      this.batches.push(writes.map((write) => write.path));
    } catch (error) {
      this.docs = snapshot;
      throw error;
    }
  }

  async setDoc(path: string, data: Record<string, unknown>): Promise<void> {
    this.docs.set(path, { ...data });
  }

  async updateDoc(path: string, data: Record<string, unknown>): Promise<void> {
    const existing = this.docs.get(path);
    if (!existing) throw new Error(`Missing document ${path}`);
    this.docs.set(path, { ...existing, ...data });
  }

  async getDoc(path: string): Promise<StoredDocument> {
    const data = this.docs.get(path);
    return {
      id: path.split("/").at(-1) ?? path,
      exists: data != null,
      data: () => (data ? { ...data } : undefined),
    };
  }

  async getCollection(collectionPath: string) {
    return this.children(collectionPath);
  }

  async limitCollection(collectionPath: string, limitCount: number) {
    this.limitedReads.push({ path: collectionPath, limitCount });
    return this.children(collectionPath).slice(0, limitCount);
  }

  async orderedLimitCollection(
    collectionPath: string,
    orderField: string,
    direction: "asc" | "desc",
    limitCount: number,
  ) {
    this.orderedQueries.push({
      path: collectionPath,
      field: orderField,
      direction,
      limitCount,
    });
    if (this.failOrderedReads) throw new Error("cannot order attempts");
    const sorted = [...this.children(collectionPath)].sort((left, right) => {
      const delta = comparableMillis(left.data[orderField]) - comparableMillis(right.data[orderField]);
      return direction === "desc" ? -delta : delta;
    });
    return sorted.slice(0, limitCount);
  }

  async runTransaction<T>(
    fn: (transaction: LearningProgressTransaction) => Promise<T>,
  ): Promise<T> {
    const snapshot = new Map(this.docs);
    const writes: WriteOp[] = [];
    const transaction: LearningProgressTransaction = {
      get: (path) => this.getDoc(path),
      set: (path, data) => {
        writes.push({ op: "set", path, data: { ...data } });
        this.docs.set(path, { ...data });
      },
      update: (path, data) => {
        writes.push({ op: "update", path, data: { ...data } });
        const existing = this.docs.get(path);
        if (!existing) throw new Error(`Missing document ${path}`);
        this.docs.set(path, { ...existing, ...data });
      },
      delete: (path) => {
        writes.push({ op: "delete", path });
        this.docs.delete(path);
      },
    };
    try {
      const result = await fn(transaction);
      this.transactionWriteSets.push(writes);
      return result;
    } catch (error) {
      this.docs = snapshot;
      throw error;
    }
  }

  private children(collectionPath: string) {
    const prefix = `${collectionPath}/`;
    const rows: Array<{ id: string; data: Record<string, unknown> }> = [];
    for (const [path, data] of this.docs) {
      if (!path.startsWith(prefix)) continue;
      const id = path.slice(prefix.length);
      if (id.includes("/")) continue;
      rows.push({ id, data: { ...data } });
    }
    return rows;
  }
}

function questionResult(questionId: string, isCorrect: boolean): QuizQuestionResult {
  return {
    questionId,
    selectedAnswer: isCorrect ? "a" : "b",
    correctAnswer: "a",
    isCorrect,
  };
}

function suggestion(overrides: Partial<MissedQuestionsSuggestion> = {}): MissedQuestionsSuggestion {
  return {
    type: "missed_questions",
    courseId: "course-1",
    sourceDocKey: "doc-key",
    quizId: "quiz-1",
    questionIds: ["q2"],
    questionFailureCounts: { q2: 2 },
    status: "active",
    priority: 3,
    linkedTaskId: "task-1",
    sourceAttemptId: "attempt-1",
    ...overrides,
  };
}

function newAttempt(overrides: Partial<NewQuizAttempt> = {}): NewQuizAttempt {
  return {
    courseId: "course-1",
    quizId: "quiz-1",
    answers: { q1: "a", q2: "b" },
    score: 1,
    total: 2,
    attemptType: "full_quiz",
    questionIds: ["q1", "q2"],
    questionResults: [questionResult("q1", true), questionResult("q2", false)],
    sourceTaskId: "task-1",
    sourceSuggestionId: null,
    ...overrides,
  };
}

function outcome(overrides: Partial<PersistQuizOutcomeInput> = {}): PersistQuizOutcomeInput {
  return {
    courseId: "course-1",
    quizId: "quiz-1",
    attemptId: "attempt-1",
    mastery: { value: 72, level: "developing", sourceAttemptIds: ["attempt-1"] },
    suggestion: suggestion(),
    taskId: "task-1",
    ...overrides,
  };
}

function seedAttempt(store: MemoryStore, attemptId = "attempt-1", status = "pending") {
  store.docs.set(quizAttemptPath(UID, "course-1", "quiz-1", attemptId), {
    answers: { q1: "a" },
    score: 1,
    total: 2,
    completedAt: { toMillis: () => 10 },
    processingStatus: status,
  });
  store.docs.set(pendingQuizAttemptPath(UID, attemptId), {
    courseId: "course-1",
    quizId: "quiz-1",
    attemptId,
  });
}

describe("learning progress repository", () => {
  it("creates an attempt with history fields, pending processing, and a pending ref", async () => {
    const store = new MemoryStore();
    const repo = createLearningProgressRepository(UID, store);

    const attemptId = await repo.createQuizAttempt(newAttempt());
    const secondId = await repo.createQuizAttempt(newAttempt());

    expect(attemptId).not.toBe(secondId);
    expect(attemptId.includes("/")).toBe(false);

    const attempt = store.docs.get(quizAttemptPath(UID, "course-1", "quiz-1", attemptId));
    expect(attempt).toMatchObject({
      answers: { q1: "a", q2: "b" },
      score: 1,
      total: 2,
      completedAt: store.stamp,
      processingStatus: "pending",
      attemptType: "full_quiz",
      questionIds: ["q1", "q2"],
      sourceTaskId: "task-1",
      sourceSuggestionId: null,
    });
    expect(attempt?.questionResults).toEqual([
      questionResult("q1", true),
      questionResult("q2", false),
    ]);
    expect(attempt && "stack" in attempt).toBe(false);
    expect(store.docs.get(pendingQuizAttemptPath(UID, attemptId))).toEqual({
      courseId: "course-1",
      quizId: "quiz-1",
      attemptId,
    });
    expect(store.batches[0]).toEqual([
      quizAttemptPath(UID, "course-1", "quiz-1", attemptId),
      pendingQuizAttemptPath(UID, attemptId),
    ]);
    for (const path of store.docs.keys()) {
      expect(path.startsWith(`users/${UID}/`)).toBe(true);
    }
  });

  it("rolls back the attempt when the pending ref cannot commit with it", async () => {
    const store = new MemoryStore();
    const repo = createLearningProgressRepository(UID, store);
    store.failNextBatch = true;

    await expect(repo.createQuizAttempt(newAttempt())).rejects.toThrow("batch failed");

    expect(store.docs.size).toBe(0);
    expect(await repo.listPendingAttempts(10)).toEqual([]);

    const attemptId = await repo.createQuizAttempt(newAttempt());
    expect(store.docs.has(quizAttemptPath(UID, "course-1", "quiz-1", attemptId))).toBe(true);
    expect(store.docs.get(pendingQuizAttemptPath(UID, attemptId))?.attemptId).toBe(attemptId);
  });

  it("applies suggestion, mastery, and processed attempt fields in one transaction", async () => {
    const store = new MemoryStore();
    const repo = createLearningProgressRepository(UID, store);
    seedAttempt(store);
    const input = outcome();

    const status = await repo.applyQuizOutcome(input);

    expect(status).toBe("processed");
    expect(store.transactionWriteSets).toHaveLength(1);
    const suggestionId = learningSuggestionId(input.courseId, input.quizId);
    const masteryId = documentMasteryId(input.courseId, "doc-key");
    expect(store.transactionWriteSets[0].map((write) => `${write.op} ${write.path}`).sort()).toEqual(
      [
        `set ${learningSuggestionPath(UID, suggestionId)}`,
        `update ${quizAttemptPath(UID, input.courseId, input.quizId, input.attemptId)}`,
        `set ${documentMasteryPath(UID, masteryId)}`,
        `delete ${pendingQuizAttemptPath(UID, input.attemptId)}`,
      ].sort(),
    );
    expect(store.docs.get(learningSuggestionPath(UID, suggestionId))).toEqual({
      ...input.suggestion,
      updatedAt: store.stamp,
    });
    expect(store.docs.get(documentMasteryPath(UID, masteryId))).toEqual({
      courseId: input.courseId,
      sourceDocKey: "doc-key",
      value: 72,
      level: "developing",
      sourceAttemptIds: ["attempt-1"],
      updatedAt: store.stamp,
    });
    expect(store.docs.get(quizAttemptPath(UID, input.courseId, input.quizId, input.attemptId))).toMatchObject({
      answers: { q1: "a" },
      score: 1,
      total: 2,
      processingStatus: "processed",
      processedAt: store.stamp,
    });
    expect(store.docs.has(pendingQuizAttemptPath(UID, input.attemptId))).toBe(false);
    expect(await repo.getSuggestion(input.courseId, input.quizId)).toMatchObject({
      ...input.suggestion,
      id: suggestionId,
    });
  });

  it("does not write again when the attempt is already processed", async () => {
    const store = new MemoryStore();
    const repo = createLearningProgressRepository(UID, store);
    seedAttempt(store);
    const input = outcome();

    expect(await repo.applyQuizOutcome(input)).toBe("processed");
    const afterFirst = store.docs.get(
      learningSuggestionPath(UID, learningSuggestionId(input.courseId, input.quizId)),
    );

    const second = await repo.applyQuizOutcome({
      ...input,
      mastery: { value: 10, level: "weak", sourceAttemptIds: ["other"] },
      suggestion: suggestion({ priority: 99, sourceAttemptId: "other" }),
    });

    expect(second).toBe("already_processed");
    expect(store.transactionWriteSets).toHaveLength(2);
    expect(store.transactionWriteSets[1]).toEqual([]);
    expect(
      store.docs.get(learningSuggestionPath(UID, learningSuggestionId(input.courseId, input.quizId))),
    ).toEqual(afterFirst);
    expect(store.docs.get(documentMasteryPath(UID, documentMasteryId(input.courseId, "doc-key")))).toMatchObject({
      value: 72,
    });
  });

  it("skips the mastery write when mastery or sourceDocKey is missing", async () => {
    const store = new MemoryStore();
    const repo = createLearningProgressRepository(UID, store);
    seedAttempt(store, "attempt-1");
    seedAttempt(store, "attempt-2");

    await repo.applyQuizOutcome(outcome({ mastery: null }));
    await repo.applyQuizOutcome(
      outcome({
        attemptId: "attempt-2",
        suggestion: suggestion({ sourceDocKey: null, sourceAttemptId: "attempt-2" }),
      }),
    );

    expect(store.docs.has(documentMasteryPath(UID, documentMasteryId("course-1", "doc-key")))).toBe(false);
    expect(store.transactionWriteSets[0].some((write) => write.path.includes("documentMastery"))).toBe(false);
    expect(store.transactionWriteSets[1].some((write) => write.path.includes("documentMastery"))).toBe(false);
    expect(store.docs.has(pendingQuizAttemptPath(UID, "attempt-1"))).toBe(false);
    expect(store.docs.has(pendingQuizAttemptPath(UID, "attempt-2"))).toBe(false);
  });

  it("reads quiz context from the quiz set document", async () => {
    const store = new MemoryStore();
    const repo = createLearningProgressRepository(UID, store);

    expect(await repo.getQuizContext("course-1", "missing")).toBeNull();

    store.docs.set(quizSetPath(UID, "course-1", "counted"), {
      sourceDocKey: "notes-a",
      questionCount: 8,
      questions: [{ id: "only-one" }],
    });
    expect(await repo.getQuizContext("course-1", "counted")).toEqual({
      sourceDocKey: "notes-a",
      fullQuizQuestionCount: 8,
    });

    store.docs.set(quizSetPath(UID, "course-1", "from-questions"), {
      sourceDocKey: "notes-b",
      questionCount: 0,
      questions: [{ id: "q1" }, { id: "q2" }],
    });
    expect(await repo.getQuizContext("course-1", "from-questions")).toEqual({
      sourceDocKey: "notes-b",
      fullQuizQuestionCount: 2,
    });

    store.docs.set(quizSetPath(UID, "course-1", "empty"), { sourceDocKey: 4 });
    expect(await repo.getQuizContext("course-1", "empty")).toEqual({
      sourceDocKey: null,
      fullQuizQuestionCount: 0,
    });
  });

  it("lists matching attempt evidence newest first, including legacy attempts", async () => {
    const store = new MemoryStore();
    const repo = createLearningProgressRepository(UID, store);
    store.docs.set(quizSetPath(UID, "course-1", "quiz-a"), {
      sourceDocKey: "doc-key",
      questionCount: 4,
    });
    store.docs.set(quizSetPath(UID, "course-1", "quiz-b"), {
      sourceDocKey: "other-doc",
      questionCount: 9,
    });
    store.docs.set(quizAttemptPath(UID, "course-1", "quiz-a", "older"), {
      score: 1,
      total: 4,
      questionIds: ["q1", "q2", "q3", "q4"],
      completedAt: { toMillis: () => 100 },
    });
    store.docs.set(quizAttemptPath(UID, "course-1", "quiz-a", "full"), {
      attemptType: "full_quiz",
      score: 3,
      total: 4,
      questionIds: ["q1", "q2", "q3", "q4"],
      completedAt: { toMillis: () => 200 },
    });
    store.docs.set(quizAttemptPath(UID, "course-1", "quiz-a", "newer"), {
      attemptType: "targeted_practice",
      score: 0,
      total: 1,
      questionIds: ["q2"],
      completedAt: { toMillis: () => 300 },
    });
    store.docs.set(quizAttemptPath(UID, "course-1", "quiz-b", "ignored"), {
      attemptType: "full_quiz",
      score: 9,
      total: 9,
      questionIds: ["x"],
      completedAt: { toMillis: () => 999 },
    });

    const evidence = await repo.listFullAttemptEvidence("course-1", "doc-key");

    expect(evidence.map((item) => item.id)).toEqual(["full", "older"]);
    expect(evidence.map((item) => item.id)).not.toContain("newer");
    expect(evidence[1].attemptType).toBeUndefined();
    expect(evidence[1]).toMatchObject({
      score: 1,
      total: 4,
      questionIds: ["q1", "q2", "q3", "q4"],
      fullQuizQuestionCount: 4,
      completedAtMs: 100,
    });
    expect(evidence[0].attemptType).toBe("full_quiz");
    expect(store.orderedQueries).toEqual([
      {
        path: quizAttemptsCollection(UID, "course-1", "quiz-a"),
        field: "completedAt",
        direction: "desc",
        limitCount: 30,
      },
    ]);
  });

  it("keeps only full attempts inside the newest page for each quiz set", async () => {
    const store = new MemoryStore();
    const repo = createLearningProgressRepository(UID, store);
    store.docs.set(quizSetPath(UID, "course-1", "quiz-a"), {
      sourceDocKey: "doc-key",
      questionCount: 2,
    });
    store.docs.set(quizSetPath(UID, "course-1", "quiz-b"), {
      sourceDocKey: "other-doc",
      questionCount: 2,
    });
    for (let index = 0; index < 40; index += 1) {
      store.docs.set(quizAttemptPath(UID, "course-1", "quiz-a", `a-${index}`), {
        attemptType: index === 39 || index < 10 ? "full_quiz" : "targeted_practice",
        score: 1,
        total: 2,
        questionIds: ["q1", "q2"],
        completedAt: { toMillis: () => index },
      });
    }
    store.docs.set(quizAttemptPath(UID, "course-1", "quiz-b", "ignored"), {
      attemptType: "full_quiz",
      score: 2,
      total: 2,
      questionIds: ["q1", "q2"],
      completedAt: { toMillis: () => 1000 },
    });

    const evidence = await repo.listFullAttemptEvidence("course-1", "doc-key");

    expect(evidence.map((item) => item.id)).toEqual(["a-39"]);
    expect(store.orderedQueries).toEqual([
      {
        path: quizAttemptsCollection(UID, "course-1", "quiz-a"),
        field: "completedAt",
        direction: "desc",
        limitCount: 30,
      },
    ]);
    expect(store.limitedReads.some((read) => read.path.includes("/attempts"))).toBe(false);
  });

  it("falls back to a bounded unordered attempt read when ordering fails", async () => {
    const store = new MemoryStore();
    const repo = createLearningProgressRepository(UID, store);
    store.failOrderedReads = true;
    store.docs.set(quizSetPath(UID, "course-1", "quiz-a"), {
      sourceDocKey: "doc-key",
      questionCount: 2,
    });
    for (let index = 0; index < 40; index += 1) {
      store.docs.set(quizAttemptPath(UID, "course-1", "quiz-a", `a-${index}`), {
        attemptType: "full_quiz",
        score: 1,
        total: 2,
        questionIds: ["q1", "q2"],
        completedAt: { toMillis: () => index },
      });
    }

    const evidence = await repo.listFullAttemptEvidence("course-1", "doc-key");

    expect(evidence).toHaveLength(30);
    expect(evidence.map((item) => item.id)).not.toContain("a-39");
    expect(store.limitedReads).toEqual([
      {
        path: quizAttemptsCollection(UID, "course-1", "quiz-a"),
        limitCount: 30,
      },
    ]);
  });

  it("uses a stable activity-event id for task finishes and a new id otherwise", async () => {
    const store = new MemoryStore();
    const repo = createLearningProgressRepository(UID, store);
    const base = {
      type: "reading_finished" as const,
      courseId: "course-1",
      sourceDocKey: "doc-key",
      resourceId: "resource-1",
      flashcardSetId: null,
      sourceTaskId: "task-9",
    };

    const first = await repo.recordActivityEvent(base);
    const second = await repo.recordActivityEvent({
      ...base,
      completedAt: Timestamp.fromMillis(55),
    });
    const independentA = await repo.recordActivityEvent({ ...base, sourceTaskId: null });
    const independentB = await repo.recordActivityEvent({ ...base, sourceTaskId: null });

    expect(first).toBe(learningActivityEventId("reading_finished", "task-9"));
    expect(second).toBe(first);
    expect(store.docs.get(learningActivityEventPath(UID, first))).toMatchObject({
      type: "reading_finished",
      sourceTaskId: "task-9",
      completedAt: Timestamp.fromMillis(55),
    });
    expect(independentA).not.toBe(independentB);
    expect(store.docs.get(learningActivityEventPath(UID, independentA))?.completedAt).toEqual(store.stamp);
  });

  it("marks an attempt failed without removing the pending ref or storing a stack", async () => {
    const store = new MemoryStore();
    const repo = createLearningProgressRepository(UID, store);
    seedAttempt(store);
    const message = "Could not apply quiz outcome";

    await repo.markAttemptFailed("course-1", "quiz-1", "attempt-1", message);

    const attempt = store.docs.get(quizAttemptPath(UID, "course-1", "quiz-1", "attempt-1"));
    expect(attempt).toMatchObject({
      processingStatus: "failed",
      processingError: message,
      answers: { q1: "a" },
    });
    expect(JSON.stringify(attempt)).not.toContain("stack");
    expect(store.docs.get(pendingQuizAttemptPath(UID, "attempt-1"))).toEqual({
      courseId: "course-1",
      quizId: "quiz-1",
      attemptId: "attempt-1",
    });
  });

  it("drops the pending ref when the attempt is already gone", async () => {
    const store = new MemoryStore();
    const repo = createLearningProgressRepository(UID, store);
    store.docs.set(pendingQuizAttemptPath(UID, "attempt-1"), {
      courseId: "course-1",
      quizId: "quiz-1",
      attemptId: "attempt-1",
    });
    store.docs.set(pendingQuizAttemptPath(UID, "attempt-2"), {
      courseId: "course-1",
      quizId: "quiz-1",
      attemptId: "attempt-2",
    });

    expect(await repo.applyQuizOutcome(outcome())).toBe("already_processed");
    await repo.markAttemptFailed("course-1", "quiz-1", "attempt-2", "Quiz attempt not found");

    expect(store.docs.has(pendingQuizAttemptPath(UID, "attempt-1"))).toBe(false);
    expect(store.docs.has(pendingQuizAttemptPath(UID, "attempt-2"))).toBe(false);
    expect(store.docs.has(learningSuggestionPath(UID, learningSuggestionId("course-1", "quiz-1")))).toBe(
      false,
    );
    expect(JSON.stringify(store.transactionWriteSets)).not.toContain("stack");
    expect(JSON.stringify([...store.docs.values()])).not.toContain("processingError");
  });

  it("lists pending attempts from the owner collection with a limit", async () => {
    const store = new MemoryStore();
    const repo = createLearningProgressRepository(UID, store);
    for (const attemptId of ["a", "b", "c"]) {
      store.docs.set(pendingQuizAttemptPath(UID, attemptId), {
        courseId: "course-1",
        quizId: "quiz-1",
        attemptId,
      });
    }
    store.docs.set(quizAttemptPath(UID, "course-1", "quiz-1", "not-pending"), {
      processingStatus: "pending",
    });

    const pending = await repo.listPendingAttempts(2);

    expect(pending).toEqual([
      { courseId: "course-1", quizId: "quiz-1", attemptId: "a" },
      { courseId: "course-1", quizId: "quiz-1", attemptId: "b" },
    ]);
    expect(await repo.getSuggestion("course-1", "quiz-1")).toBeNull();
  });

  it("reads a stored attempt for reprocessing", async () => {
    const store = new MemoryStore();
    const repo = createLearningProgressRepository(UID, store);
    const attemptId = await repo.createQuizAttempt(
      newAttempt({ sourceSuggestionId: "suggestion-1" }),
    );

    expect(await repo.getQuizAttempt("course-1", "quiz-1", attemptId)).toEqual({
      answers: { q1: "a", q2: "b" },
      questionResults: [questionResult("q1", true), questionResult("q2", false)],
      attemptType: "full_quiz",
      questionIds: ["q1", "q2"],
      taskId: "task-1",
      suggestionId: "suggestion-1",
      score: 1,
      total: 2,
      completedAt: 0,
    });
    expect(await repo.getQuizAttempt("course-1", "quiz-1", "missing")).toBeNull();
  });
});
