import { classifyMastery } from "./masteryEngine";

export interface ConceptSessionEvidence {
  id: string;
  conceptKey: string;
  percent: number;
  completedAtMs: number;
  /** "flashcards" sessions are rejected by computeConceptMastery. */
  kind: "quiz" | "fill_blank" | "word_problem" | "drag_drop" | "flashcards";
}

const SESSION_WEIGHTS = [1, 0.5, 0.25] as const;

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function computeConceptMastery(
  sessions: ConceptSessionEvidence[],
): { value: number; level: "weak" | "developing" | "strong"; sourceSessionIds: string[] } | null {
  const recent = sessions
    .filter((session) => session.kind !== "flashcards")
    .sort((a, b) => b.completedAtMs - a.completedAtMs)
    .slice(0, 3);
  if (recent.length === 0) return null;
  const weightTotal = recent.reduce((sum, _, index) => sum + SESSION_WEIGHTS[index], 0);
  const raw = recent.reduce((sum, session, index) =>
    sum + (session.percent / 100) * SESSION_WEIGHTS[index], 0
  ) / weightTotal * 100;
  const value = clampPercent(raw);
  return {
    value,
    level: classifyMastery(value),
    sourceSessionIds: recent.map((session) => session.id),
  };
}
