import { difficultyLabel, QUIZ_DIFFICULTIES, type QuizDifficulty } from "../quizDifficulty";
import type { ActivityTarget } from "./types";

/** The highest level in the map, or null when there are no known levels. */
function highestLevel(levels: Record<string, QuizDifficulty>): QuizDifficulty | null {
  let highest: QuizDifficulty | null = null;
  let highestIndex = -1;
  for (const level of Object.values(levels)) {
    const index = QUIZ_DIFFICULTIES.indexOf(level);
    if (index > highestIndex) {
      highest = level;
      highestIndex = index;
    }
  }
  return highest;
}

/**
 * Label for the level badge on a task card, or null when the task has no level.
 * Legacy targets saved before conceptLevels existed have no map, so read it defensively.
 */
export function taskLevelBadge(target: ActivityTarget | null | undefined): string | null {
  if (target?.kind !== "concept_practice") return null;
  const level = highestLevel(target.conceptLevels ?? {});
  return level ? difficultyLabel(level) : null;
}
