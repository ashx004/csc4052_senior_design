import { applyFocusedSession, type FocusedSessionResult } from "./closeConceptLoop";
import { conceptKey } from "./conceptKey";
import { computeConceptMastery, type ConceptSessionEvidence } from "./conceptMasteryEngine";
import type { ScoredItem } from "./conceptRetirement";
import type { FocusedSessionRepository } from "./conceptWeakSpotRepository";
import { conceptSessionId } from "./firestorePaths";
import type { ConceptWeakSpot, QuizQuestionResult } from "./types";

export type { FocusedSessionRepository } from "./conceptWeakSpotRepository";

/** Quiz items are right or wrong, so each scores 0 or 1. Untagged questions cannot be scored against a concept. */
export function itemsFromQuizAttempt(
  questions: { id: string; conceptKey?: string }[],
  questionResults: QuizQuestionResult[],
): ScoredItem[] {
  const keyById = new Map(questions.map((question) => [question.id, question.conceptKey]));
  const items: ScoredItem[] = [];
  for (const result of questionResults) {
    const conceptKey = keyById.get(result.questionId);
    if (!conceptKey) continue;
    items.push({ conceptKey, score: result.isCorrect ? 1 : 0 });
  }
  return items;
}

/**
 * Practice scores are fractional and pass through unchanged. Keys are normalised the same way
 * the quiz path normalises labels, so model casing or spacing cannot split a concept. Untagged
 * items are dropped.
 */
export function itemsFromPracticeResults(
  items: { id: string; conceptKey?: string }[],
  results: { itemId: string; score: number; selfMarked?: boolean }[],
): ScoredItem[] {
  const keyById = new Map(
    items.map((item) => [
      item.id,
      typeof item.conceptKey === "string" ? conceptKey(item.conceptKey) || undefined : undefined,
    ]),
  );
  const scored: ScoredItem[] = [];
  for (const result of results) {
    const conceptKey = keyById.get(result.itemId);
    if (!conceptKey) continue;
    scored.push({
      conceptKey,
      score: result.score,
      ...(result.selfMarked ? { selfMarked: true } : {}),
    });
  }
  return scored;
}

export type ConceptSessionRow = ConceptSessionEvidence & { courseId: string };

export interface ConceptMasteryValue {
  conceptKey: string;
  value: number;
  level: string;
  sourceSessionIds: string[];
}

export interface FocusedSessionPlan {
  /** Only the weak spots this session changed, stamped with the course. */
  weakSpots: ConceptWeakSpot[];
  sessions: ConceptSessionRow[];
  mastery: ConceptMasteryValue[];
  retired: string[];
  reopened: string[];
}

/**
 * Works out everything a finished session changes without writing anything, so a caller can
 * commit it together with other writes. Session row ids are deterministic, so running the same
 * session again overwrites its rows instead of adding more.
 */
export async function planFocusedSession(
  repo: Pick<FocusedSessionRepository, "listConceptSessions">,
  existing: ConceptWeakSpot[],
  session: FocusedSessionResult,
): Promise<FocusedSessionPlan> {
  const empty: FocusedSessionPlan = { weakSpots: [], sessions: [], mastery: [], retired: [], reopened: [] };
  // Flashcards never move a weak spot or mastery, and there is nothing to score without items.
  if (session.kind === "flashcards" || session.items.length === 0) return empty;

  const applied = applyFocusedSession(existing, session);
  const weakSpots = applied.weakSpots
    .filter((spot) => !existing.includes(spot))
    .map((spot) => ({ ...spot, courseId: session.courseId }));
  if (applied.masteryUpdates.length === 0) {
    return { ...empty, weakSpots, retired: applied.retired, reopened: applied.reopened };
  }

  const sessions: ConceptSessionRow[] = applied.masteryUpdates.map((update) => ({
    id: conceptSessionId(session.courseId, session.sessionId, update.conceptKey),
    courseId: session.courseId,
    conceptKey: update.conceptKey,
    percent: update.percent,
    completedAtMs: session.completedAtMs,
    kind: session.kind,
  }));
  const conceptKeys = sessions.map((row) => row.conceptKey);
  const stored = await repo.listConceptSessions(session.courseId, conceptKeys);
  const byId = new Map<string, ConceptSessionEvidence>(stored.map((row) => [row.id, row]));
  for (const row of sessions) byId.set(row.id, row);

  const mastery: ConceptMasteryValue[] = [];
  for (const conceptKey of conceptKeys) {
    const value = computeConceptMastery(
      [...byId.values()].filter((row) => row.conceptKey === conceptKey),
    );
    if (value) mastery.push({ conceptKey, ...value });
  }
  return { weakSpots, sessions, mastery, retired: applied.retired, reopened: applied.reopened };
}

export async function finishFocusedSession(
  repo: FocusedSessionRepository,
  session: FocusedSessionResult,
): Promise<{ retired: string[]; reopened: string[] }> {
  if (session.kind === "flashcards" || session.items.length === 0) {
    return { retired: [], reopened: [] };
  }
  const existing = await repo.listAll(session.courseId);
  const plan = await planFocusedSession(repo, existing, session);
  if (plan.weakSpots.length > 0) await repo.save(plan.weakSpots);
  if (plan.sessions.length > 0) await repo.saveConceptSessions(plan.sessions);
  if (plan.mastery.length > 0) await repo.saveConceptMastery(session.courseId, plan.mastery);
  return { retired: plan.retired, reopened: plan.reopened };
}
