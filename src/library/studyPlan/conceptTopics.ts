import type { ConceptWeakSpot, EligibleTopic } from "./types";

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

export function conceptTopicsFromWeakSpots(
  weakSpots: ConceptWeakSpot[],
  courseName: string,
  courseCode: string,
): EligibleTopic[] {
  return weakSpots
    .filter((spot) => spot.status === "open")
    .map((spot) => ({
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
        generatedSetId: null,
        generationClaimedAtMs: null,
      },
      quizMastery: null,
      flashcardEngagement: null,
      lastStudiedAt: null,
      skipCount: 0,
      repeatMissCount: spot.misses.filter(
        (miss) => miss.failureCount >= REPEAT_FAILURE_THRESHOLD,
      ).length,
    }));
}
