import { buildBloomPlan, type BloomLevel, type QuizDifficulty } from "@/src/library/quizDifficulty";
import { conceptKey as normalizeConceptKey } from "@/src/library/studyPlan/conceptKey";
import type { ConceptFocus } from "./conceptFocus";

/** One planned question: which concept, at which quiz level, targeting which Bloom level. */
export interface ConceptSlot {
  /** Empty for a slot that belongs to no concept (padding). */
  conceptKey: string;
  label: string;
  level: QuizDifficulty;
  bloomLevel: BloomLevel;
}

interface TakenSlot {
  conceptKey: string;
  bloomLevel: BloomLevel;
}

/** Slots with no concept, one per Bloom level in the `level` plan. */
export function unassignedSlots(level: QuizDifficulty, count: number): ConceptSlot[] {
  return buildBloomPlan(level, count).map((bloomLevel) => ({ conceptKey: "", label: "", level, bloomLevel }));
}

/**
 * One slot per question, each concept planned at its own level. Null when no quota carries a
 * level: that means "single request difficulty", and the caller keeps its existing path.
 */
export function buildConceptSlotPlan(
  focus: ConceptFocus | undefined,
  fallback: QuizDifficulty,
  count: number,
): ConceptSlot[] | null {
  if (!focus || !focus.quotas.some((quota) => quota.level)) return null;
  const slots = focus.quotas.flatMap((quota) => {
    const level = quota.level ?? fallback;
    return buildBloomPlan(level, quota.items).map((bloomLevel) => ({
      conceptKey: quota.conceptKey,
      label: quota.label,
      level,
      bloomLevel,
    }));
  });
  return [...slots, ...unassignedSlots(fallback, count - slots.length)].slice(0, Math.max(0, count));
}

/** The slots still unfilled after `taken`; each taken question uses up one slot with the same concept and Bloom level. */
export function remainingSlots(slots: readonly ConceptSlot[], taken: readonly TakenSlot[]): ConceptSlot[] {
  const remaining = [...slots];
  for (const t of taken) {
    const key = normalizeConceptKey(t.conceptKey);
    const index = remaining.findIndex((slot) => slot.conceptKey && normalizeConceptKey(slot.conceptKey) === key && slot.bloomLevel === t.bloomLevel);
    if (index >= 0) remaining.splice(index, 1);
  }
  return remaining;
}

/**
 * Whether a question still fills an unfilled slot. Position is not used: dropped questions
 * shift positions, so the check is against what is left to ask for.
 */
export function matchesRemainingDemand(
  slots: readonly ConceptSlot[],
  taken: readonly TakenSlot[],
  candidate: { conceptKey: string | null; bloomLevel: BloomLevel },
): boolean {
  if (!candidate.conceptKey) return false;
  const key = normalizeConceptKey(candidate.conceptKey);
  return remainingSlots(slots, taken).some(
    (slot) => slot.conceptKey && normalizeConceptKey(slot.conceptKey) === key && slot.bloomLevel === candidate.bloomLevel,
  );
}

/** The Bloom level of the first unfilled slot for a concept, or null when it needs no more questions. */
export function plannedLevelFor(slots: readonly ConceptSlot[], taken: readonly TakenSlot[], conceptKey: string): BloomLevel | null {
  const key = normalizeConceptKey(conceptKey);
  const slot = remainingSlots(slots, taken).find((s) => s.conceptKey && normalizeConceptKey(s.conceptKey) === key);
  return slot?.bloomLevel ?? null;
}
