import { MIN_SCORED_ITEMS_TO_RETIRE } from "@/src/library/studyPlan/conceptRetirement";
import type { QuizDifficulty } from "@/src/library/quizDifficulty";
import { allocateQuotas } from "./allocateQuotas";

export interface ConceptDemand {
  conceptKey: string;
  label: string;
  missCount: number;
}

export interface ConceptQuota {
  conceptKey: string;
  label: string;
  items: number;
  /** The level this concept is quizzed at. Absent means "use the request's single difficulty". */
  level?: QuizDifficulty;
}

export function allocateConceptQuotas(
  concepts: ConceptDemand[],
  requestedCount: number,
  maxCount: number,
): { quotas: ConceptQuota[]; deferred: ConceptDemand[]; totalItems: number } {
  if (concepts.length === 0) {
    return { quotas: [], deferred: [], totalItems: 0 };
  }

  const sorted = [...concepts].sort((a, b) => b.missCount - a.missCount);
  const includedCount = Math.min(
    sorted.length,
    Math.floor(maxCount / MIN_SCORED_ITEMS_TO_RETIRE),
  );
  const included = sorted.slice(0, includedCount);
  const deferred = sorted.slice(includedCount);

  if (included.length === 0) {
    return { quotas: [], deferred, totalItems: 0 };
  }

  const totalItems = Math.min(
    maxCount,
    Math.max(requestedCount, includedCount * MIN_SCORED_ITEMS_TO_RETIRE),
  );

  const rawQuotas = allocateQuotas(
    included.map((c) => ({ id: c.conceptKey, textLength: c.missCount })),
    totalItems,
  );

  for (let i = 0; i < rawQuotas.length; i++) {
    if (rawQuotas[i] < MIN_SCORED_ITEMS_TO_RETIRE) {
      const deficit = MIN_SCORED_ITEMS_TO_RETIRE - rawQuotas[i];
      let largestIndex = 0;
      for (let j = 1; j < rawQuotas.length; j++) {
        if (rawQuotas[j] > rawQuotas[largestIndex]) {
          largestIndex = j;
        }
      }
      rawQuotas[i] = MIN_SCORED_ITEMS_TO_RETIRE;
      rawQuotas[largestIndex] -= deficit;
    }
  }

  const quotas: ConceptQuota[] = included.map((concept, i) => ({
    conceptKey: concept.conceptKey,
    label: concept.label,
    items: rawQuotas[i],
  }));

  return { quotas, deferred, totalItems };
}
