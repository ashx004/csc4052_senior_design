import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { QUIZ_DIFFICULTIES, type QuizDifficulty } from "@/src/library/quizDifficulty";
import type { ConceptSessionEvidence } from "./conceptMasteryEngine";
import {
  conceptMasteryId,
  conceptMasteryPath,
  conceptSessionPath,
  conceptWeakSpotId,
  conceptWeakSpotPath,
  documentMasteryId,
  documentMasteryPath,
  learningActivityEventId,
  learningActivityEventPath,
  learningActivityEventsCollection,
  learningSuggestionId,
  learningSuggestionPath,
  pendingQuizAttemptPath,
  pendingQuizAttemptsCollection,
  quizAttemptPath,
  quizAttemptsCollection,
  quizSetPath,
  quizSetsCollection,
} from "./firestorePaths";
import {
  createConceptWeakSpotRepository,
  conceptMasteryData,
  conceptSessionData,
  toStoredData as conceptWeakSpotData,
  type ConceptMasteryInput,
  type FocusedSessionRepository,
} from "./conceptWeakSpotRepository";
import type {
  ConceptWeakSpot,
  MissedQuestionsSuggestion,
  NewLearningActivityEvent,
  NewQuizAttempt,
  PendingAttemptRef,
  PersistQuizOutcomeInput,
  QuizAttemptEvidence,
  QuizAttemptType,
  QuizContext,
  QuizQuestionResult,
} from "./types";

export interface StoredDocument {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface LearningProgressTransaction {
  get(path: string): Promise<StoredDocument>;
  /**
   * `{ merge: true }` keeps fields the written data omits. Concept mastery needs it: a quiz
   * taken from a set with no stored level must leave `lastAskedLevel` alone rather than
   * replace the document without it (see conceptMasteryData).
   */
  set(path: string, data: Record<string, unknown>, options?: { merge: boolean }): void;
  update(path: string, data: Record<string, unknown>): void;
  delete(path: string): void;
}

export interface BatchWrite {
  path: string;
  data: Record<string, unknown>;
}

export interface LearningProgressStore {
  addDoc(collectionPath: string, data: Record<string, unknown>): Promise<string>;
  newId(collectionPath: string): Promise<string>;
  commitBatch(writes: BatchWrite[]): Promise<void>;
  setDoc(path: string, data: Record<string, unknown>): Promise<void>;
  updateDoc(path: string, data: Record<string, unknown>): Promise<void>;
  getDoc(path: string): Promise<StoredDocument>;
  getCollection(
    collectionPath: string,
  ): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  limitCollection(
    collectionPath: string,
    limitCount: number,
  ): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  orderedLimitCollection(
    collectionPath: string,
    orderField: string,
    direction: "asc" | "desc",
    limitCount: number,
  ): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  runTransaction<T>(
    fn: (transaction: LearningProgressTransaction) => Promise<T>,
  ): Promise<T>;
  serverTimestamp(): unknown;
}

export interface StoredQuizAttempt {
  answers: Record<string, string>;
  questionResults: QuizQuestionResult[];
  attemptType: QuizAttemptType;
  questionIds: string[];
  taskId: string | null;
  suggestionId: string | null;
  score: number;
  total: number;
  completedAt: number;
}

export type ApplyQuizOutcomeInput = Omit<PersistQuizOutcomeInput, "suggestion"> & {
  /** Legacy missed-questions suggestion; omitted once weak spots replace it. */
  suggestion?: MissedQuestionsSuggestion;
  sourceDocKey?: string | null;
  /** Written in the same transaction that marks the attempt processed, so a retry cannot count a miss twice. */
  conceptWeakSpots?: ConceptWeakSpot[];
  /**
   * Focused-session rows and mastery for this attempt, written in the same transaction as the
   * weak spots and the processed mark. If any of it fails nothing is written and the attempt stays
   * pending, so a retry recomputes from the same stored state instead of counting a miss twice.
   */
  conceptSessions?: (ConceptSessionEvidence & { courseId: string })[];
  conceptMastery?: ConceptMasteryInput[];
};

export interface ApplyNamedMissesInput {
  courseId: string;
  quizId: string;
  attemptId: string;
  weakSpots: ConceptWeakSpot[];
}

export interface LearningProgressRepository {
  createQuizAttempt(input: NewQuizAttempt): Promise<string>;
  getQuizAttempt(
    courseId: string,
    quizId: string,
    attemptId: string,
  ): Promise<StoredQuizAttempt | null>;
  getQuizContext(courseId: string, quizId: string): Promise<QuizContext | null>;
  listFullAttemptEvidence(courseId: string, sourceDocKey: string): Promise<QuizAttemptEvidence[]>;
  getQuizQuestionConcepts(courseId: string, quizId: string): Promise<Record<string, string>>;
  conceptWeakSpots: FocusedSessionRepository;
  applyQuizOutcome(input: ApplyQuizOutcomeInput): Promise<"processed" | "already_processed">;
  /**
   * Saves weak spots for misses named after processing, and marks the attempt in the same
   * transaction. A pending attempt is left alone: processing it later reads the saved labels.
   */
  applyNamedMisses(input: ApplyNamedMissesInput): Promise<"recorded" | "already_recorded" | "not_processed">;
  recordActivityEvent(input: NewLearningActivityEvent): Promise<string>;
  markAttemptFailed(
    courseId: string,
    quizId: string,
    attemptId: string,
    message: string,
  ): Promise<void>;
  listPendingAttempts(limitCount: number): Promise<PendingAttemptRef[]>;
}

function asDocumentData(data: Record<string, unknown>): DocumentData {
  return data;
}

function readSourceDocKey(data: Record<string, unknown>): string | null {
  return typeof data.sourceDocKey === "string" ? data.sourceDocKey : null;
}

function readConceptLevels(data: Record<string, unknown>): Record<string, QuizDifficulty> {
  const raw = data.conceptLevels;
  const levels: Record<string, QuizDifficulty> = {};
  if (!raw || typeof raw !== "object") return levels;
  for (const [key, level] of Object.entries(raw)) {
    if ((QUIZ_DIFFICULTIES as readonly string[]).includes(level as string)) {
      levels[key] = level as QuizDifficulty;
    }
  }
  return levels;
}

function readFullQuizQuestionCount(data: Record<string, unknown>): number {
  if (typeof data.questionCount === "number" && Number.isFinite(data.questionCount) && data.questionCount > 0) {
    return data.questionCount;
  }
  if (Array.isArray(data.questions)) return data.questions.length;
  return 0;
}

function toMillis(value: unknown): number {
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

function readStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function readQuestionResults(value: unknown): QuizQuestionResult[] {
  if (!Array.isArray(value)) return [];
  const results: QuizQuestionResult[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.questionId !== "string") continue;
    results.push({
      questionId: row.questionId,
      selectedAnswer: typeof row.selectedAnswer === "string" ? row.selectedAnswer : "",
      correctAnswer: typeof row.correctAnswer === "string" ? row.correctAnswer : "",
      isCorrect: row.isCorrect === true,
    });
  }
  return results;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readQuestionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

const FULL_ATTEMPT_READ_LIMIT = 30;

function isFullQuizOrLegacyAttempt(data: Record<string, unknown>): boolean {
  if (!Object.prototype.hasOwnProperty.call(data, "attemptType")) return true;
  return data.attemptType === undefined || data.attemptType === "full_quiz";
}

function readAttemptType(value: unknown): QuizAttemptType | undefined {
  if (value === "full_quiz" || value === "targeted_practice") return value;
  return undefined;
}

function toAttemptEvidence(
  id: string,
  data: Record<string, unknown>,
  fullQuizQuestionCount: number,
): QuizAttemptEvidence {
  const evidence: QuizAttemptEvidence = {
    id,
    score: typeof data.score === "number" ? data.score : 0,
    total: typeof data.total === "number" ? data.total : 0,
    questionIds: readQuestionIds(data.questionIds),
    fullQuizQuestionCount,
    completedAtMs: toMillis(data.completedAt),
  };
  const attemptType = readAttemptType(data.attemptType);
  if (attemptType) evidence.attemptType = attemptType;
  return evidence;
}

function readQuestionConcepts(data: Record<string, unknown>): Record<string, string> {
  const concepts: Record<string, string> = {};
  if (!Array.isArray(data.questions)) return concepts;
  for (const item of data.questions) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.concept !== "string") continue;
    if (row.concept.trim() !== "") concepts[row.id] = row.concept;
  }
  return concepts;
}

export function createLearningProgressRepository(
  uid: string,
  store: LearningProgressStore,
  conceptWeakSpots: FocusedSessionRepository = createConceptWeakSpotRepository(uid),
): LearningProgressRepository {
  return {
    conceptWeakSpots,

    async createQuizAttempt(input: NewQuizAttempt): Promise<string> {
      const attemptsCollection = quizAttemptsCollection(uid, input.courseId, input.quizId);
      const attemptId = await store.newId(attemptsCollection);
      const completedAt = store.serverTimestamp();
      await store.commitBatch([
        {
          path: quizAttemptPath(uid, input.courseId, input.quizId, attemptId),
          data: {
            answers: input.answers,
            score: input.score,
            total: input.total,
            completedAt,
            processingStatus: "pending",
            attemptType: input.attemptType,
            questionIds: input.questionIds,
            questionResults: input.questionResults,
            sourceTaskId: input.sourceTaskId,
            sourceSuggestionId: input.sourceSuggestionId,
          },
        },
        {
          path: pendingQuizAttemptPath(uid, attemptId),
          data: {
            courseId: input.courseId,
            quizId: input.quizId,
            attemptId,
          },
        },
      ]);
      return attemptId;
    },

    async getQuizAttempt(
      courseId: string,
      quizId: string,
      attemptId: string,
    ): Promise<StoredQuizAttempt | null> {
      const snap = await store.getDoc(quizAttemptPath(uid, courseId, quizId, attemptId));
      if (!snap.exists) return null;
      const data = snap.data() ?? {};
      const attemptType = readAttemptType(data.attemptType) ?? "full_quiz";
      return {
        answers: readStringRecord(data.answers),
        questionResults: readQuestionResults(data.questionResults),
        attemptType,
        questionIds: readQuestionIds(data.questionIds),
        taskId: readNullableString(data.sourceTaskId),
        suggestionId: readNullableString(data.sourceSuggestionId),
        score: typeof data.score === "number" ? data.score : 0,
        total: typeof data.total === "number" ? data.total : 0,
        completedAt: toMillis(data.completedAt),
      };
    },

    async getQuizContext(courseId: string, quizId: string): Promise<QuizContext | null> {
      const snap = await store.getDoc(quizSetPath(uid, courseId, quizId));
      if (!snap.exists) return null;
      const data = snap.data() ?? {};
      return {
        sourceDocKey: readSourceDocKey(data),
        fullQuizQuestionCount: readFullQuizQuestionCount(data),
        conceptLevels: readConceptLevels(data),
      };
    },

    async listFullAttemptEvidence(
      courseId: string,
      sourceDocKey: string,
    ): Promise<QuizAttemptEvidence[]> {
      const quizSets = await store.getCollection(quizSetsCollection(uid, courseId));
      const matching = quizSets.filter((quizSet) => quizSet.data.sourceDocKey === sourceDocKey);
      const evidence: QuizAttemptEvidence[] = [];
      for (const quizSet of matching) {
        const fullQuizQuestionCount = readFullQuizQuestionCount(quizSet.data);
        const attemptsPath = quizAttemptsCollection(uid, courseId, quizSet.id);
        let attempts: Array<{ id: string; data: Record<string, unknown> }>;
        try {
          attempts = await store.orderedLimitCollection(
            attemptsPath,
            "completedAt",
            "desc",
            FULL_ATTEMPT_READ_LIMIT,
          );
        } catch {
          attempts = await store.limitCollection(attemptsPath, FULL_ATTEMPT_READ_LIMIT);
        }
        for (const attempt of attempts) {
          if (!isFullQuizOrLegacyAttempt(attempt.data)) continue;
          evidence.push(toAttemptEvidence(attempt.id, attempt.data, fullQuizQuestionCount));
        }
      }
      evidence.sort((left, right) => right.completedAtMs - left.completedAtMs);
      return evidence;
    },

    async getQuizQuestionConcepts(courseId: string, quizId: string) {
      const snap = await store.getDoc(quizSetPath(uid, courseId, quizId));
      if (!snap.exists) return {};
      return readQuestionConcepts(snap.data() ?? {});
    },

    async applyQuizOutcome(input: ApplyQuizOutcomeInput) {
      const attemptPath = quizAttemptPath(uid, input.courseId, input.quizId, input.attemptId);
      const suggestionPath = learningSuggestionPath(
        uid,
        learningSuggestionId(input.courseId, input.quizId),
      );
      const pendingPath = pendingQuizAttemptPath(uid, input.attemptId);
      const sourceDocKey = input.suggestion?.sourceDocKey ?? input.sourceDocKey ?? null;
      const writtenAt = store.serverTimestamp();

      return store.runTransaction(async (transaction) => {
        const attempt = await transaction.get(attemptPath);
        if (!attempt.exists) {
          transaction.delete(pendingPath);
          return "already_processed";
        }
        if (attempt.data()?.processingStatus === "processed") return "already_processed";

        for (const spot of input.conceptWeakSpots ?? []) {
          transaction.set(
            conceptWeakSpotPath(uid, conceptWeakSpotId(spot.courseId, spot.conceptKey)),
            conceptWeakSpotData(spot),
          );
        }
        for (const row of input.conceptSessions ?? []) {
          transaction.set(conceptSessionPath(uid, row.id), conceptSessionData(row));
        }
        for (const value of input.conceptMastery ?? []) {
          // Merged, not replaced: a row that carries no lastAskedLevel must preserve the stored
          // one, so the ladder keeps its anchor and its one-rung step limit still applies.
          transaction.set(
            conceptMasteryPath(uid, conceptMasteryId(input.courseId, value.conceptKey)),
            conceptMasteryData(input.courseId, value),
            { merge: true },
          );
        }
        if (input.suggestion) {
          transaction.set(suggestionPath, {
            ...input.suggestion,
            updatedAt: writtenAt,
          });
        }
        transaction.update(attemptPath, {
          processingStatus: "processed",
          processedAt: writtenAt,
        });
        if (input.mastery && sourceDocKey) {
          transaction.set(documentMasteryPath(uid, documentMasteryId(input.courseId, sourceDocKey)), {
            courseId: input.courseId,
            sourceDocKey,
            value: input.mastery.value,
            level: input.mastery.level,
            sourceAttemptIds: input.mastery.sourceAttemptIds,
            updatedAt: writtenAt,
          });
        }
        transaction.delete(pendingPath);
        return "processed";
      });
    },

    async applyNamedMisses(input: ApplyNamedMissesInput) {
      const attemptPath = quizAttemptPath(uid, input.courseId, input.quizId, input.attemptId);
      return store.runTransaction(async (transaction) => {
        const attempt = await transaction.get(attemptPath);
        const data = attempt.data();
        if (!attempt.exists || data?.processingStatus !== "processed") return "not_processed";
        if (data.namedMissesRecorded === true) return "already_recorded";
        for (const spot of input.weakSpots) {
          transaction.set(
            conceptWeakSpotPath(uid, conceptWeakSpotId(spot.courseId, spot.conceptKey)),
            conceptWeakSpotData(spot),
          );
        }
        transaction.update(attemptPath, {
          namedMissesRecorded: true,
          namedMissesRecordedAt: store.serverTimestamp(),
        });
        return "recorded";
      });
    },

    async recordActivityEvent(input: NewLearningActivityEvent): Promise<string> {
      const data = {
        type: input.type,
        courseId: input.courseId,
        sourceDocKey: input.sourceDocKey,
        resourceId: input.resourceId,
        flashcardSetId: input.flashcardSetId,
        sourceTaskId: input.sourceTaskId,
        completedAt: input.completedAt ?? store.serverTimestamp(),
      };
      if (input.sourceTaskId != null) {
        const eventId = learningActivityEventId(input.type, input.sourceTaskId);
        await store.setDoc(learningActivityEventPath(uid, eventId), data);
        return eventId;
      }
      return store.addDoc(learningActivityEventsCollection(uid), data);
    },

    async markAttemptFailed(
      courseId: string,
      quizId: string,
      attemptId: string,
      message: string,
    ): Promise<void> {
      const attemptPath = quizAttemptPath(uid, courseId, quizId, attemptId);
      const pendingPath = pendingQuizAttemptPath(uid, attemptId);
      await store.runTransaction(async (transaction) => {
        const attempt = await transaction.get(attemptPath);
        if (!attempt.exists) {
          transaction.delete(pendingPath);
          return;
        }
        transaction.update(attemptPath, {
          processingStatus: "failed",
          processingError: message,
        });
      });
    },

    async listPendingAttempts(limitCount: number): Promise<PendingAttemptRef[]> {
      const rows = await store.limitCollection(pendingQuizAttemptsCollection(uid), limitCount);
      return rows.flatMap((row) => {
        const courseId = row.data.courseId;
        const quizId = row.data.quizId;
        if (typeof courseId !== "string" || typeof quizId !== "string") return [];
        const attemptId = typeof row.data.attemptId === "string" ? row.data.attemptId : row.id;
        return [{ courseId, quizId, attemptId }];
      });
    },
  };
}

function createFirebaseStore(getDb: () => Promise<Firestore>): LearningProgressStore {
  return {
    async addDoc(collectionPath, data) {
      const db = await getDb();
      const ref = await addDoc(collection(db, collectionPath), asDocumentData(data));
      return ref.id;
    },
    async newId(collectionPath) {
      const db = await getDb();
      return doc(collection(db, collectionPath)).id;
    },
    async commitBatch(writes) {
      const db = await getDb();
      const batch = writeBatch(db);
      for (const write of writes) {
        batch.set(doc(db, write.path), asDocumentData(write.data));
      }
      await batch.commit();
    },
    async setDoc(path, data) {
      const db = await getDb();
      await setDoc(doc(db, path), asDocumentData(data));
    },
    async updateDoc(path, data) {
      const db = await getDb();
      await updateDoc(doc(db, path), asDocumentData(data));
    },
    async getDoc(path) {
      const db = await getDb();
      const snap = await getDoc(doc(db, path));
      return {
        id: snap.id,
        exists: snap.exists(),
        data: () => (snap.exists() ? snap.data() : undefined),
      };
    },
    async getCollection(collectionPath) {
      const db = await getDb();
      const snap = await getDocs(collection(db, collectionPath));
      return snap.docs.map((item) => ({ id: item.id, data: item.data() }));
    },
    async limitCollection(collectionPath, limitCount) {
      const db = await getDb();
      const snap = await getDocs(query(collection(db, collectionPath), limit(limitCount)));
      return snap.docs.map((item) => ({ id: item.id, data: item.data() }));
    },
    async orderedLimitCollection(collectionPath, orderField, direction, limitCount) {
      const db = await getDb();
      const snap = await getDocs(
        query(
          collection(db, collectionPath),
          orderBy(orderField, direction),
          limit(limitCount),
        ),
      );
      return snap.docs.map((item) => ({ id: item.id, data: item.data() }));
    },
    serverTimestamp() {
      return serverTimestamp();
    },
    async runTransaction(fn) {
      const db = await getDb();
      return runTransaction(db, async (transaction) =>
        fn({
          async get(path) {
            const snap = await transaction.get(doc(db, path));
            return {
              id: snap.id,
              exists: snap.exists(),
              data: () => (snap.exists() ? snap.data() : undefined),
            };
          },
          set(path, data, options) {
            if (options) transaction.set(doc(db, path), asDocumentData(data), options);
            else transaction.set(doc(db, path), asDocumentData(data));
          },
          update(path, data) {
            transaction.update(doc(db, path), asDocumentData(data));
          },
          delete(path) {
            transaction.delete(doc(db, path));
          },
        }),
      );
    },
  };
}

export function createFirebaseLearningProgressRepository(uid: string): LearningProgressRepository {
  let dbPromise: Promise<Firestore> | null = null;
  const getDb = () => {
    dbPromise ??= import("@/src/library/firebase").then((firebase) => firebase.db);
    return dbPromise;
  };
  return createLearningProgressRepository(uid, createFirebaseStore(getDb));
}
