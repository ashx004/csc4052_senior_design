import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { conceptKey } from "./conceptKey";
import { QUIZ_DIFFICULTIES, type QuizDifficulty } from "@/src/library/quizDifficulty";
import type { ConceptSessionEvidence } from "./conceptMasteryEngine";
import {
  conceptMasteryCollection,
  conceptMasteryId,
  conceptMasteryPath,
  conceptSessionPath,
  conceptSessionsCollection,
  conceptWeakSpotId,
  conceptWeakSpotPath,
  conceptWeakSpotsCollection,
} from "./firestorePaths";
import type { ConceptMiss, ConceptWeakSpot } from "./types";

export interface ConceptWeakSpotRepository {
  listOpen(courseId: string): Promise<ConceptWeakSpot[]>;
  listAll(courseId: string): Promise<ConceptWeakSpot[]>;
  save(spots: ConceptWeakSpot[]): Promise<void>;
}

/**
 * One concept's mastery to store. `level` is the mastery band (weak, developing, strong);
 * `lastAskedLevel` is the quiz difficulty the concept was last asked at, a different thing.
 */
export interface ConceptMasteryInput {
  conceptKey: string;
  value: number;
  level: string;
  sourceSessionIds: string[];
  lastAskedLevel?: QuizDifficulty | null;
}

export interface FocusedSessionRepository extends ConceptWeakSpotRepository {
  listConceptSessions(courseId: string, conceptKeys: string[]): Promise<ConceptSessionEvidence[]>;
  /** Rows carry their course so the stored document can be found again by course. */
  saveConceptSessions(sessions: (ConceptSessionEvidence & { courseId: string })[]): Promise<void>;
  saveConceptMastery(
    courseId: string,
    values: ConceptMasteryInput[],
  ): Promise<void>;
}

const SESSION_KINDS: readonly string[] = ["quiz", "fill_blank", "word_problem", "drag_drop"];

function toConceptSession(id: string, data: Record<string, unknown>): ConceptSessionEvidence | null {
  if (typeof data.conceptKey !== "string") return null;
  if (typeof data.percent !== "number" || typeof data.completedAtMs !== "number") return null;
  if (typeof data.kind !== "string" || !SESSION_KINDS.includes(data.kind)) return null;
  return {
    id,
    conceptKey: data.conceptKey,
    percent: data.percent,
    completedAtMs: data.completedAtMs,
    kind: data.kind as ConceptSessionEvidence["kind"],
  };
}

function readMisses(value: unknown): ConceptMiss[] {
  if (!Array.isArray(value)) return [];
  const misses: ConceptMiss[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.questionId !== "string" || typeof row.quizId !== "string") continue;
    misses.push({
      questionId: row.questionId,
      quizId: row.quizId,
      failureCount: typeof row.failureCount === "number" ? row.failureCount : 0,
    });
  }
  return misses;
}

function toWeakSpot(data: Record<string, unknown>): ConceptWeakSpot | null {
  if (typeof data.courseId !== "string" || typeof data.conceptKey !== "string") return null;
  if (data.status !== "open" && data.status !== "retired") return null;
  return {
    courseId: data.courseId,
    conceptKey: data.conceptKey,
    label: typeof data.label === "string" ? data.label : data.conceptKey,
    misses: readMisses(data.misses),
    sourceDocKeys: Array.isArray(data.sourceDocKeys)
      ? data.sourceDocKeys.filter((key): key is string => typeof key === "string")
      : [],
    status: data.status,
    openedAtMs: typeof data.openedAtMs === "number" ? data.openedAtMs : 0,
    retiredAtMs: typeof data.retiredAtMs === "number" ? data.retiredAtMs : null,
    timesReopened: typeof data.timesReopened === "number" ? data.timesReopened : 0,
  };
}

export function toStoredData(spot: ConceptWeakSpot): Record<string, unknown> {
  return {
    courseId: spot.courseId,
    conceptKey: spot.conceptKey,
    label: spot.label,
    misses: spot.misses.map((miss) => ({
      questionId: miss.questionId,
      quizId: miss.quizId,
      failureCount: miss.failureCount,
    })),
    sourceDocKeys: spot.sourceDocKeys,
    status: spot.status,
    openedAtMs: spot.openedAtMs,
    retiredAtMs: spot.retiredAtMs,
    timesReopened: spot.timesReopened,
  };
}

export function conceptSessionData(
  session: ConceptSessionEvidence & { courseId: string },
): Record<string, unknown> {
  return {
    courseId: session.courseId,
    conceptKey: session.conceptKey,
    percent: session.percent,
    completedAtMs: session.completedAtMs,
    kind: session.kind,
  };
}

export function conceptMasteryData(
  courseId: string,
  value: ConceptMasteryInput,
): Record<string, unknown> {
  return {
    courseId,
    conceptKey: value.conceptKey,
    value: value.value,
    level: value.level,
    sourceSessionIds: value.sourceSessionIds,
    // Only written when the caller supplies it. A caller that omits it (a flashcard session)
    // must leave a stored level alone, while an explicit null clears it.
    ...("lastAskedLevel" in value ? { lastAskedLevel: value.lastAskedLevel ?? null } : {}),
    updatedAtMs: Date.now(),
  };
}

/**
 * Stored concept mastery for one course, keyed by normalized concept key. A missing
 * lastAskedLevel (rows saved before it existed) reads as null, which the level ladder treats as no anchor.
 */
export async function readConceptMastery(
  uid: string,
  courseId: string,
): Promise<Map<string, { value: number; lastAskedLevel: QuizDifficulty | null }>> {
  const { db } = await import("@/src/library/firebase");
  const snap = await getDocs(
    query(collection(db, conceptMasteryCollection(uid)), where("courseId", "==", courseId)),
  );
  const mastery = new Map<string, { value: number; lastAskedLevel: QuizDifficulty | null }>();
  for (const item of snap.docs) {
    const data = item.data();
    if (typeof data.conceptKey !== "string" || typeof data.value !== "number") continue;
    const asked = data.lastAskedLevel;
    mastery.set(conceptKey(data.conceptKey), {
      value: data.value,
      lastAskedLevel:
        typeof asked === "string" && (QUIZ_DIFFICULTIES as readonly string[]).includes(asked)
          ? (asked as QuizDifficulty)
          : null,
    });
  }
  return mastery;
}

export function createConceptWeakSpotRepository(uid: string): FocusedSessionRepository {
  let dbPromise: Promise<Firestore> | null = null;
  const getDb = () => {
    dbPromise ??= import("@/src/library/firebase").then((firebase) => firebase.db);
    return dbPromise;
  };

  async function read(courseId: string, openOnly: boolean): Promise<ConceptWeakSpot[]> {
    const db = await getDb();
    const ref = collection(db, conceptWeakSpotsCollection(uid));
    const constraints = openOnly
      ? [where("courseId", "==", courseId), where("status", "==", "open")]
      : [where("courseId", "==", courseId)];
    const snap = await getDocs(query(ref, ...constraints));
    return snap.docs.flatMap((item) => {
      const spot = toWeakSpot(item.data());
      return spot ? [spot] : [];
    });
  }

  return {
    listOpen: (courseId) => read(courseId, true),
    listAll: (courseId) => read(courseId, false),
    async save(spots) {
      if (spots.length === 0) return;
      const db = await getDb();
      const batch = writeBatch(db);
      for (const spot of spots) {
        const id = conceptWeakSpotId(spot.courseId, spot.conceptKey);
        batch.set(doc(db, conceptWeakSpotPath(uid, id)), toStoredData(spot));
      }
      await batch.commit();
    },
    async listConceptSessions(courseId, conceptKeys) {
      if (conceptKeys.length === 0) return [];
      const db = await getDb();
      const ref = collection(db, conceptSessionsCollection(uid));
      const snap = await getDocs(query(ref, where("courseId", "==", courseId)));
      return snap.docs.flatMap((item) => {
        const row = toConceptSession(item.id, item.data());
        return row && conceptKeys.includes(row.conceptKey) ? [row] : [];
      });
    },
    async saveConceptSessions(sessions) {
      if (sessions.length === 0) return;
      const db = await getDb();
      const batch = writeBatch(db);
      for (const session of sessions) {
        batch.set(doc(db, conceptSessionPath(uid, session.id)), conceptSessionData(session));
      }
      await batch.commit();
    },
    async saveConceptMastery(courseId, values) {
      if (values.length === 0) return;
      const db = await getDb();
      const batch = writeBatch(db);
      for (const value of values) {
        batch.set(
          doc(db, conceptMasteryPath(uid, conceptMasteryId(courseId, value.conceptKey))),
          conceptMasteryData(courseId, value),
          // Merge so a focused session never erases the level a quiz attempt recorded.
          { merge: true },
        );
      }
      await batch.commit();
    },
  };
}
