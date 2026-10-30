import type { QuizDifficulty } from "@/src/library/quizDifficulty";
import {
  allocateConceptQuotas,
  type ConceptQuota,
} from "@/src/library/generation/allocateConceptQuotas";
import type { ConceptFocus } from "@/src/library/generation/conceptFocus";
import { conceptKey, isUsableConceptLabel } from "./conceptKey";
import { chooseConceptLevel } from "./quizLevelLadder";

/** How many items a daily quiz task asks for, and the most it may grow to so every concept keeps its floor. */
export const DAILY_QUIZ_QUESTION_COUNT = 10;
export const DAILY_QUIZ_MAX_QUESTIONS = 12;

/**
 * How many of the newest quiz sets built from the same document the daily task avoids
 * repeating questions from. The task asks ten questions a day from one document, and
 * /api/generate-quiz keeps only the first 60 avoid strings, so an unbounded list would fill
 * that cap within a week and then reject every reworded question the model could still make
 * — the daily quiz would shrink day by day, and concepts left out of a short quiz record no
 * level, stalling the ladder. Three sets is roughly the last three days: long enough that a
 * question never comes straight back, and about 30 strings, well under the route's cap so the
 * newest questions are never the ones truncated away.
 */
export const DAILY_QUIZ_AVOID_SET_LIMIT = 3;

export interface ConceptEvidence {
  conceptKey: string;
  label: string;
  missCount: number;
  /** 0-100, null when the concept has no session evidence of its own. */
  conceptMastery: number | null;
  lastAskedLevel: QuizDifficulty | null;
  repeatMissCount: number;
}

export interface StoredConceptMastery {
  value: number;
  lastAskedLevel: QuizDifficulty | null;
}

/**
 * Splits a daily quiz task's items across the concepts and gives each its own level.
 * Returns null when there is nothing to aim at, so the caller can keep the plain quiz link.
 * `avoid` is left empty; the caller fills it.
 */
export function buildDailyQuizFocus(input: {
  concepts: readonly ConceptEvidence[];
  /** 0-1, the quizMastery scale. */
  documentMastery: number | null;
  daysUntilExam: number | null;
  questionCount: number;
  maxCount: number;
}): ConceptFocus | null {
  if (input.concepts.length === 0) return null;

  const { quotas } = allocateConceptQuotas(
    input.concepts.map(({ conceptKey: key, label, missCount }) => ({ conceptKey: key, label, missCount })),
    input.questionCount,
    input.maxCount,
  );
  if (quotas.length === 0) return null;

  const evidenceByKey = new Map(input.concepts.map((concept) => [concept.conceptKey, concept]));
  const leveled: ConceptQuota[] = quotas.map((quota) => {
    const evidence = evidenceByKey.get(quota.conceptKey);
    return {
      ...quota,
      level: chooseConceptLevel({
        conceptMastery: evidence?.conceptMastery ?? null,
        documentMastery: input.documentMastery,
        lastAskedLevel: evidence?.lastAskedLevel ?? null,
        repeatMissCount: evidence?.repeatMissCount ?? 0,
        daysUntilExam: input.daysUntilExam,
      }),
    };
  });
  return { quotas: leveled, avoid: [] };
}

/**
 * Derives a set's concepts from its questions' `concept` field. Each question counts once toward
 * its concept, which is the weight the quota split uses. Mastery is joined by normalized key.
 */
export function conceptEvidenceFromQuestions(
  questions: readonly { concept?: unknown }[],
  mastery: ReadonlyMap<string, StoredConceptMastery>,
): ConceptEvidence[] {
  const byKey = new Map<string, ConceptEvidence>();
  for (const question of questions) {
    const label = typeof question.concept === "string" ? question.concept.trim() : "";
    if (!label || !isUsableConceptLabel(label)) continue;
    const key = conceptKey(label);
    const existing = byKey.get(key);
    if (existing) {
      existing.missCount += 1;
      continue;
    }
    const stored = mastery.get(key);
    byKey.set(key, {
      conceptKey: key,
      label,
      missCount: 1,
      conceptMastery: stored?.value ?? null,
      lastAskedLevel: stored?.lastAskedLevel ?? null,
      repeatMissCount: 0,
    });
  }
  return [...byKey.values()];
}
