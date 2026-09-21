import {
  chooseActivityType,
  ESTIMATED_MINUTES,
} from "./recommendationEngine";
import type { EligibleTopic, SetupConfig } from "./types";

function averageMastery(topic: EligibleTopic): number {
  const known = [topic.quizMastery, topic.flashcardEngagement].filter(
    (value): value is number => value !== null
  );
  if (known.length === 0) return 0;
  return known.reduce((sum, value) => sum + value, 0) / known.length;
}

/** Explains why a setup submission could not produce a recommended task. */
export function getEmptyRecommendationReason(
  config: SetupConfig,
  topics: EligibleTopic[],
  exams: Map<string, number>
): string {
  if (topics.length === 0) {
    return "No quiz sets or flashcard sets were found for your enrolled courses.";
  }

  const scopedTopics = config.courseId
    ? topics.filter((topic) => topic.courseId === config.courseId)
    : topics;

  if (scopedTopics.length === 0) {
    return "No study topics were found for the selected course.";
  }

  if (
    config.goal === "exam_prep" &&
    !scopedTopics.some((topic) => exams.has(topic.courseId))
  ) {
    return "No upcoming exam or deadline was found for the selected course.";
  }

  if (
    config.goal === "weak_topics" &&
    !scopedTopics.some((topic) => averageMastery(topic) < 0.6)
  ) {
    return "No weak topics were found below the current mastery threshold.";
  }

  const fitsTime = scopedTopics.some(
    (topic) =>
      ESTIMATED_MINUTES[
        chooseActivityType(topic, config.activityPreference)
      ] <= config.availableMinutes
  );

  if (!fitsTime) {
    return "No recommended task fits your available study time.";
  }

  return "No recommended tasks were available for this setup.";
}
