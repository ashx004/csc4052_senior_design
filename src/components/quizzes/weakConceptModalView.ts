import { conceptKey, isUsableConceptLabel } from "@/src/library/studyPlan/conceptKey";
import type { ConceptWeakSpot } from "@/src/library/studyPlan/types";

export type ModalLayer = "result" | "format" | "practice_kind";

export interface ModalConcept {
  conceptKey: string;
  label: string;
  missCount: number;
}

/**
 * The attempt's misses grouped by concept, most missed first. A question with
 * no usable tag and no returned name is listed in `unnamedIds`, never dropped.
 */
export function missedConcepts(
  questions: readonly { id: string; correctAnswer: string; concept?: string }[],
  answers: Record<string, string>,
  namedLabels: Record<string, string>,
  existing: readonly Pick<ConceptWeakSpot, "conceptKey" | "label">[],
): { concepts: ModalConcept[]; unnamedIds: string[] } {
  const byKey = new Map<string, ModalConcept>();
  const unnamedIds: string[] = [];
  for (const question of questions) {
    if (answers[question.id] === question.correctAnswer) continue;
    const tagged = question.concept?.trim() ?? "";
    const label = tagged && isUsableConceptLabel(tagged) ? tagged : (namedLabels[question.id] ?? "");
    if (!label || !isUsableConceptLabel(label)) {
      unnamedIds.push(question.id);
      continue;
    }
    const key = conceptKey(label);
    const current = byKey.get(key);
    if (current) {
      current.missCount += 1;
    } else {
      const display = existing.find((spot) => spot.conceptKey === key)?.label ?? label;
      byKey.set(key, { conceptKey: key, label: display, missCount: 1 });
    }
  }
  const concepts = [...byKey.values()].sort((a, b) => b.missCount - a.missCount);
  return { concepts, unnamedIds };
}

/**
 * The open weak spots for these concepts, merged into one, so
 * buildRetryWrongAnswersTasks makes a single task per quiz.
 */
export function retryWeakSpot(
  spots: readonly ConceptWeakSpot[],
  conceptKeys: readonly string[],
): ConceptWeakSpot | null {
  const chosen = conceptKeys.flatMap((key) => spots.filter((spot) => spot.conceptKey === key));
  if (chosen.length === 0) return null;
  return {
    ...chosen[0],
    label: chosen.map((spot) => spot.label).join(", "),
    misses: chosen.flatMap((spot) => spot.misses),
    sourceDocKeys: [...new Set(chosen.flatMap((spot) => spot.sourceDocKeys))],
  };
}

export interface ResultHeadline {
  pillText: string;
  tone: "weak" | "clear";
  noteText: string;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function resultHeadline(
  score: number,
  total: number,
  concepts: { label: string; missCount: number }[],
  namingPending: boolean,
): ResultHeadline {
  const missed = Math.max(0, total - score);

  if (namingPending && concepts.length === 0) {
    return {
      pillText: "Needs improvement",
      tone: "weak",
      noteText: `You missed ${plural(missed, "question")}. We're still working out which concepts they cover.`,
    };
  }

  if (concepts.length === 0) {
    return {
      pillText: "Looking good",
      tone: "clear",
      noteText:
        missed === 0
          ? "Nothing weak to work on. You got every question right."
          : "Nothing weak stands out from this attempt.",
    };
  }

  return {
    pillText: "Needs improvement",
    tone: "weak",
    noteText: `You missed ${plural(missed, "question")}, mainly in ${plural(concepts.length, "concept")}. Let's practice these topics to make it stick.`,
  };
}
