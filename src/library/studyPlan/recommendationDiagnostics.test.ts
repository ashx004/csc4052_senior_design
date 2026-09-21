import { describe, expect, it } from "vitest";
import { getEmptyRecommendationReason } from "./recommendationDiagnostics";
import type { EligibleTopic, SetupConfig } from "./types";

const topic: EligibleTopic = {
  courseId: "csc430",
  courseName: "Database",
  courseCode: "CSC430",
  topicLabel: "SQL Joins",
  targetId: "quiz-1",
  activityType: "quiz",
  quizMastery: 0.3,
  flashcardEngagement: null,
  lastStudiedAt: null,
  skipCount: 0,
};

const config: SetupConfig = {
  availableMinutes: 60,
  goal: "general",
  courseId: null,
  activityPreference: "auto",
};

describe("getEmptyRecommendationReason", () => {
  it("explains when the account has no quiz or flashcard topics", () => {
    expect(getEmptyRecommendationReason(config, [], new Map())).toContain(
      "quiz sets or flashcard sets"
    );
  });

  it("explains when exam prep has no matching upcoming exam", () => {
    expect(
      getEmptyRecommendationReason(
        { ...config, goal: "exam_prep" },
        [topic],
        new Map()
      )
    ).toContain("upcoming exam or deadline");
  });

  it("explains when no task fits the selected time", () => {
    expect(
      getEmptyRecommendationReason(
        { ...config, availableMinutes: 15 },
        [topic],
        new Map()
      )
    ).toContain("available study time");
  });
});
