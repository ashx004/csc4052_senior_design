import type { ConceptFocus } from "@/src/library/generation/conceptFocus";
import type { QuizDifficulty } from "@/src/library/quizDifficulty";
import { conceptKey } from "@/src/library/studyPlan/conceptKey";
import { highestQuotaLevel } from "@/src/library/studyPlan/targetedPractice";

/**
 * The level fields saved on a focused quiz set. `difficulty` is always one valid level (the highest
 * in the mix); `mixedLevels` is what the UI reads to show that the set mixes levels.
 */
export function quizSetLevelFields(focus: ConceptFocus): {
  difficulty: QuizDifficulty;
  conceptLevels: Record<string, QuizDifficulty>;
  mixedLevels: boolean;
} {
  const difficulty = highestQuotaLevel(focus);
  const conceptLevels: Record<string, QuizDifficulty> = {};
  for (const quota of focus.quotas) {
    conceptLevels[conceptKey(quota.conceptKey)] = quota.level ?? difficulty;
  }
  const distinctLevels = new Set(Object.values(conceptLevels));
  return { difficulty, conceptLevels, mixedLevels: distinctLevels.size > 1 };
}

/**
 * True for a quiz set the daily study plan generated for one of its own tasks. Sets saved
 * before the marker existed have no field, which reads as not plan-generated — the behaviour
 * they already had.
 */
export function isGeneratedForPlan(data: Record<string, unknown> | null | undefined): boolean {
  return data?.generatedForPlan === true;
}
