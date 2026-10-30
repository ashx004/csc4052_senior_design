import { QUIZ_DIFFICULTIES, type QuizDifficulty } from "@/src/library/quizDifficulty";
import { classifyMastery } from "./masteryEngine";

export interface ConceptLevelInput {
  conceptMastery: number | null; // 0-100, null = no session evidence
  documentMastery: number | null; // 0-1 (EligibleTopic.quizMastery scale)
  lastAskedLevel: QuizDifficulty | null;
  repeatMissCount: number;
  daysUntilExam: number | null;
}

export const EXAM_BUMP_WITHIN_DAYS = 3;

const TOP_RUNG = QUIZ_DIFFICULTIES.length - 1;
const REPEAT_MISS_HOLD = 2;

const RUNG_BY_BAND = {
  weak: "review",
  developing: "exam",
  strong: "challenge",
} as const satisfies Record<ReturnType<typeof classifyMastery>, QuizDifficulty>;

function rungOf(level: QuizDifficulty): number {
  return QUIZ_DIFFICULTIES.indexOf(level);
}

/** Entry level for a concept with no evidence of its own. Never above exam. */
export function entryLevel(documentMastery: number | null): QuizDifficulty {
  if (documentMastery === null) return "review";
  return classifyMastery(documentMastery * 100) === "strong" ? "exam" : "review";
}

/**
 * Picks the quiz level for one concept: base rung, repeat-miss hold, exam bump, then a one-rung clamp.
 * The hold sets the target to review and skips the bump, but the clamp still applies last,
 * so a bad session steps challenge down to exam rather than straight to review.
 */
export function chooseConceptLevel(input: ConceptLevelInput): QuizDifficulty {
  let rung =
    input.conceptMastery !== null
      ? rungOf(RUNG_BY_BAND[classifyMastery(input.conceptMastery)])
      : rungOf(entryLevel(input.documentMastery));

  if (input.repeatMissCount >= REPEAT_MISS_HOLD) {
    rung = rungOf("review");
  } else if (input.daysUntilExam !== null && input.daysUntilExam <= EXAM_BUMP_WITHIN_DAYS) {
    rung = Math.min(rung + 1, TOP_RUNG);
  }

  if (input.lastAskedLevel !== null) {
    const anchor = rungOf(input.lastAskedLevel);
    rung = Math.min(Math.max(rung, anchor - 1), anchor + 1);
  }

  return QUIZ_DIFFICULTIES[rung];
}
