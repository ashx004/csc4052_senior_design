import type { QuizDifficulty } from "@/src/library/quizDifficulty";
import { conceptKey } from "./conceptKey";
import { chooseConceptLevel } from "./quizLevelLadder";
import type { ConceptWeakSpot, EligibleTopic } from "./types";

/**
 * Stored evidence the level ladder needs. Omitted entirely by callers that have no mastery
 * loaded, which keeps today's unleveled behaviour.
 */
export interface WeakSpotLevelInputs {
  conceptMastery: ReadonlyMap<string, { value: number; lastAskedLevel: QuizDifficulty | null }>;
  daysUntilExam: number | null;
}

const REPEAT_FAILURE_THRESHOLD = 2;
const MIN_QUESTION_COUNT = 3;
const MAX_QUESTION_COUNT = 12;
const QUESTIONS_PER_MISS = 3;

function questionCountFor(missCount: number): number {
  return Math.max(
    MIN_QUESTION_COUNT,
    Math.min(MAX_QUESTION_COUNT, missCount * QUESTIONS_PER_MISS),
  );
}

function levelFor(
  spot: ConceptWeakSpot,
  repeatMissCount: number,
  levels: WeakSpotLevelInputs | undefined,
): Record<string, QuizDifficulty> {
  if (!levels) return {};
  const key = conceptKey(spot.conceptKey);
  const stored = levels.conceptMastery.get(key);
  return {
    [key]: chooseConceptLevel({
      conceptMastery: stored?.value ?? null,
      // A weak spot is about one concept, so the document's own mastery says nothing useful here.
      documentMastery: null,
      lastAskedLevel: stored?.lastAskedLevel ?? null,
      repeatMissCount,
      daysUntilExam: levels.daysUntilExam,
    }),
  };
}

export function conceptTopicsFromWeakSpots(
  weakSpots: ConceptWeakSpot[],
  courseName: string,
  courseCode: string,
  levels?: WeakSpotLevelInputs,
): EligibleTopic[] {
  return weakSpots
    .filter((spot) => spot.status === "open")
    .map((spot) => {
      const repeatMissCount = spot.misses.filter(
        (miss) => miss.failureCount >= REPEAT_FAILURE_THRESHOLD,
      ).length;
      return {
      courseId: spot.courseId,
      courseName,
      courseCode,
      topicLabel: spot.label,
      conceptLabel: spot.label,
      targetId: null,
      activityType: "quiz" as const,
      activityTarget: {
        kind: "concept_practice" as const,
        conceptKeys: [spot.conceptKey],
        conceptLabels: [spot.label],
        sourceDocKeys: [...spot.sourceDocKeys],
        practiceType: "quiz" as const,
        questionCount: questionCountFor(spot.misses.length),
        // A weak spot is a concept the student MISSED, so the ladder usually lands on `review`.
        // Without mastery loaded the map stays empty, which keeps the unleveled behaviour.
        conceptLevels: levelFor(spot, repeatMissCount, levels),
        generatedSetId: null,
        generationClaimedAtMs: null,
      },
      quizMastery: null,
      flashcardEngagement: null,
      lastStudiedAt: null,
      skipCount: 0,
      repeatMissCount,
      };
    });
}
