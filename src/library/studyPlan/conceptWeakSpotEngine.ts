import { conceptKey, isUsableConceptLabel } from "./conceptKey";
import type { ConceptMiss, ConceptWeakSpot } from "./types";

export interface AttemptConceptResult {
  questionId: string;
  quizId: string;
  conceptLabel: string | null; // null = untagged and not yet named
  sourceDocKey: string | null;
  isCorrect: boolean;
}

export function reconcileConceptWeakSpots(
  existing: ConceptWeakSpot[],
  results: AttemptConceptResult[],
  nowMs: number,
): ConceptWeakSpot[] {
  const grouped = groupUsableResults(results);
  if (grouped.size === 0) return existing;

  const next = [...existing];
  const indexByKey = new Map(next.map((spot, index) => [spot.conceptKey, index]));
  const courseId = existing.find((spot) => spot.courseId)?.courseId ?? "";

  for (const [key, group] of grouped) {
    const index = indexByKey.get(key);
    if (index === undefined) {
      const opened = openWeakSpot(key, group, courseId, nowMs);
      if (!opened) continue;
      indexByKey.set(key, next.length);
      next.push(opened);
      continue;
    }
    next[index] = applyAttempt(next[index], group);
  }

  return next;
}

function groupUsableResults(
  results: AttemptConceptResult[],
): Map<string, AttemptConceptResult[]> {
  const grouped = new Map<string, AttemptConceptResult[]>();
  for (const result of results) {
    const label = result.conceptLabel;
    if (label == null || !isUsableConceptLabel(label)) continue;
    const key = conceptKey(label);
    const group = grouped.get(key);
    if (group) group.push(result);
    else grouped.set(key, [result]);
  }
  return grouped;
}

function openWeakSpot(
  key: string,
  results: AttemptConceptResult[],
  courseId: string,
  nowMs: number,
): ConceptWeakSpot | null {
  const label = results[0]?.conceptLabel;
  if (!label) return null;
  const opened = applyAttempt(
    {
      courseId,
      conceptKey: key,
      label,
      misses: [],
      sourceDocKeys: [],
      status: "open",
      openedAtMs: nowMs,
      retiredAtMs: null,
      timesReopened: 0,
    },
    results,
  );
  return opened.misses.length > 0 ? opened : null;
}

function applyAttempt(
  spot: ConceptWeakSpot,
  results: AttemptConceptResult[],
): ConceptWeakSpot {
  const misses: ConceptMiss[] = spot.misses.map((miss) => ({ ...miss }));
  const sourceDocKeys = [...spot.sourceDocKeys];

  for (const result of results) {
    if (result.isCorrect) {
      const index = misses.findIndex((miss) => miss.questionId === result.questionId);
      if (index !== -1) misses.splice(index, 1);
      continue;
    }
    if (result.sourceDocKey && !sourceDocKeys.includes(result.sourceDocKey)) {
      sourceDocKeys.push(result.sourceDocKey);
    }
    const existingMiss = misses.find((miss) => miss.questionId === result.questionId);
    if (!existingMiss) {
      misses.push({
        questionId: result.questionId,
        quizId: result.quizId,
        failureCount: 1,
      });
      continue;
    }
    existingMiss.failureCount += 1;
  }

  return { ...spot, misses, sourceDocKeys };
}
