import { describe, expect, it } from "vitest";
import { filterTopicsAlreadyInPlan, appendPlanTaskIds } from "./taskSuggestions";
import type { EligibleTopic, StudyTask } from "./types";

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

const existingTask = {
  courseId: "csc430",
  topicLabel: "SQL Joins",
} as StudyTask;

describe("filterTopicsAlreadyInPlan", () => {
  it("does not suggest a topic already represented in today's plan", () => {
    expect(filterTopicsAlreadyInPlan([topic], [existingTask])).toEqual([]);
  });

  it("keeps topics that are not already in today's plan", () => {
    expect(
      filterTopicsAlreadyInPlan(
        [topic],
        [{ ...existingTask, topicLabel: "Normalization" }]
      )
    ).toEqual([topic]);
  });
});

describe("appendPlanTaskIds", () => {
  it("preserves existing task IDs and appends new IDs", () => {
    expect(appendPlanTaskIds(["old-1"], ["new-1", "new-2"])).toEqual([
      "old-1",
      "new-1",
      "new-2",
    ]);
  });
});
