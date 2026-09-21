import { describe, expect, it } from "vitest";
import {
  scoreTopic,
  generateTasks,
  chooseActivityType,
  ESTIMATED_MINUTES,
} from "./recommendationEngine";
import type { EligibleTopic, SetupConfig } from "./types";

const baseTopic: EligibleTopic = {
  courseId: "csc430",
  courseName: "Database Systems",
  courseCode: "CSC430",
  topicLabel: "SQL Joins",
  targetId: "quiz1",
  activityType: "quiz",
  quizMastery: 0.5,
  flashcardEngagement: 0.5,
  lastStudiedAt: null,
  skipCount: 0,
};

describe("ESTIMATED_MINUTES", () => {
  it("has correct default times", () => {
    expect(ESTIMATED_MINUTES.quiz).toBe(20);
    expect(ESTIMATED_MINUTES.flashcards).toBe(15);
    expect(ESTIMATED_MINUTES.reading).toBe(20);
    expect(ESTIMATED_MINUTES.ai_explanation).toBe(15);
  });
});

describe("scoreTopic", () => {
  it("gives base score of 10 with no special conditions", () => {
    const scored = scoreTopic(
      { ...baseTopic, quizMastery: 0.9, flashcardEngagement: 0.9 },
      null,
      false
    );
    expect(scored.factors.baseScore).toBe(10);
    expect(scored.factors.examUrgency).toBe(0);
    expect(scored.totalScore).toBe(10);
  });

  it("adds exam urgency +30 for ≤ 3 days", () => {
    const scored = scoreTopic(baseTopic, 2, false);
    expect(scored.factors.examUrgency).toBe(30);
  });

  it("adds exam urgency +20 for 4–7 days", () => {
    const scored = scoreTopic(baseTopic, 5, false);
    expect(scored.factors.examUrgency).toBe(20);
  });

  it("adds exam urgency +10 for 8–14 days", () => {
    const scored = scoreTopic(baseTopic, 10, false);
    expect(scored.factors.examUrgency).toBe(10);
  });

  it("doubles urgency when goalDoubleUrgency is true", () => {
    const scored = scoreTopic(baseTopic, 2, true);
    expect(scored.factors.examUrgency).toBe(60);
  });

  it("adds +25 for quiz mastery < 0.40", () => {
    const scored = scoreTopic({ ...baseTopic, quizMastery: 0.3 }, null, false);
    expect(scored.factors.lowQuizMastery).toBe(25);
  });

  it("adds +15 for quiz mastery 0.40–0.60", () => {
    const scored = scoreTopic({ ...baseTopic, quizMastery: 0.5 }, null, false);
    expect(scored.factors.lowQuizMastery).toBe(15);
  });

  it("adds +5 for quiz mastery 0.60–0.80", () => {
    const scored = scoreTopic({ ...baseTopic, quizMastery: 0.7 }, null, false);
    expect(scored.factors.lowQuizMastery).toBe(5);
  });

  it("adds 0 for quiz mastery >= 0.80", () => {
    const scored = scoreTopic({ ...baseTopic, quizMastery: 0.9 }, null, false);
    expect(scored.factors.lowQuizMastery).toBe(0);
  });

  it("treats null quiz mastery as 0 (unknown)", () => {
    const scored = scoreTopic({ ...baseTopic, quizMastery: null }, null, false);
    expect(scored.factors.lowQuizMastery).toBe(25);
  });

  it("applies skip penalty of -5 per skip, max -15", () => {
    expect(
      scoreTopic({ ...baseTopic, skipCount: 1 }, null, false).factors.skipPenalty
    ).toBe(-5);
    expect(
      scoreTopic({ ...baseTopic, skipCount: 3 }, null, false).factors.skipPenalty
    ).toBe(-15);
    expect(
      scoreTopic({ ...baseTopic, skipCount: 5 }, null, false).factors.skipPenalty
    ).toBe(-15);
  });
});

describe("chooseActivityType", () => {
  it("returns the preference when not auto", () => {
    expect(chooseActivityType(baseTopic, "quiz")).toBe("quiz");
    expect(chooseActivityType(baseTopic, "flashcards")).toBe("flashcards");
    expect(chooseActivityType(baseTopic, "reading")).toBe("reading");
  });

  it("returns quiz when quiz mastery is lower than flashcard engagement (auto)", () => {
    expect(
      chooseActivityType(
        { ...baseTopic, quizMastery: 0.3, flashcardEngagement: 0.7 },
        "auto"
      )
    ).toBe("quiz");
  });

  it("returns flashcards when flashcard engagement is lower (auto)", () => {
    expect(
      chooseActivityType(
        { ...baseTopic, quizMastery: 0.7, flashcardEngagement: 0.3 },
        "auto"
      )
    ).toBe("flashcards");
  });

  it("returns reading when both mastery signals are null (auto)", () => {
    expect(
      chooseActivityType(
        { ...baseTopic, quizMastery: null, flashcardEngagement: null },
        "auto"
      )
    ).toBe("reading");
  });

  it("returns reading for a course-level fallback topic even when quiz is preferred", () => {
    expect(
      chooseActivityType(
        { ...baseTopic, targetId: null, activityType: "reading" },
        "quiz"
      )
    ).toBe("reading");
  });
});

describe("generateTasks", () => {
  const config: SetupConfig = {
    availableMinutes: 60,
    goal: "general",
    courseId: null,
    activityPreference: "auto",
  };

  const topics: EligibleTopic[] = [
    { ...baseTopic, topicLabel: "SQL Joins", targetId: "q1", quizMastery: 0.2 },
    { ...baseTopic, topicLabel: "Normalization", targetId: "q2", quizMastery: 0.5 },
    { ...baseTopic, topicLabel: "Indexing", targetId: "q3", quizMastery: 0.8 },
    { ...baseTopic, topicLabel: "Transactions", targetId: "q4", quizMastery: 0.9 },
  ];

  it("generates at most 3 tasks", () => {
    const tasks = generateTasks(config, topics, new Map());
    expect(tasks.length).toBeLessThanOrEqual(3);
  });

  it("guarantees reading, quiz, and flashcards when auto mode has a 60-minute budget", () => {
    const tasks = generateTasks(
      config,
      [
        { ...baseTopic, topicLabel: "Joins quiz", activityType: "quiz", targetId: "q1", quizMastery: null, flashcardEngagement: null },
        { ...baseTopic, topicLabel: "Joins cards", activityType: "flashcards", targetId: "f1", quizMastery: null, flashcardEngagement: null },
      ],
      new Map()
    );

    expect(tasks.map((task) => task.activityType).sort()).toEqual([
      "flashcards",
      "quiz",
      "reading",
    ]);
    expect(tasks.find((task) => task.activityType === "reading")?.targetId).toBeNull();
    expect(tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0)).toBeLessThanOrEqual(60);
  });

  it("does not force the three activity types for a 30-minute budget", () => {
    const tasks = generateTasks(
      { ...config, availableMinutes: 30 },
      [
        { ...baseTopic, activityType: "quiz", targetId: "q1" },
        { ...baseTopic, topicLabel: "Cards", activityType: "flashcards", targetId: "f1" },
      ],
      new Map()
    );

    expect(tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0)).toBeLessThanOrEqual(30);
    expect(new Set(tasks.map((task) => task.activityType)).size).toBeLessThan(3);
  });

  it("total estimated time does not exceed available minutes", () => {
    const tasks = generateTasks(config, topics, new Map());
    const totalTime = tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
    expect(totalTime).toBeLessThanOrEqual(60);
  });

  it("never repeats the same topic in one plan", () => {
    const tasks = generateTasks(config, topics, new Map());
    const labels = tasks.map((t) => t.topicLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("returns empty array when no topics are provided", () => {
    expect(generateTasks(config, [], new Map())).toEqual([]);
  });

  it("generates a reading task for a course-level fallback topic", () => {
    const tasks = generateTasks(
      config,
      [{ ...baseTopic, targetId: null, activityType: "reading", topicLabel: "Course exploration" }],
      new Map()
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0].activityType).toBe("reading");
    expect(tasks[0].targetId).toBeNull();
  });

  it("filters to a specific course when config.courseId is set", () => {
    const mixedTopics: EligibleTopic[] = [
      { ...baseTopic, courseId: "csc430", topicLabel: "A", targetId: "q1" },
      { ...baseTopic, courseId: "csc350", topicLabel: "B", targetId: "q2" },
    ];
    const tasks = generateTasks(
      { ...config, courseId: "csc430" },
      mixedTopics,
      new Map()
    );
    expect(tasks.every((t) => t.courseId === "csc430")).toBe(true);
  });

  it("filters to weak topics only when goal is weak_topics", () => {
    const tasks = generateTasks(
      { ...config, goal: "weak_topics" },
      topics,
      new Map()
    );
    // Only topics with mastery < 0.60 should appear
    // SQL Joins (0.2) and Normalization (0.5) qualify
    expect(tasks.every((t) => {
      const topic = topics.find((tp) => tp.topicLabel === t.topicLabel);
      return (topic?.quizMastery ?? 0) < 0.60;
    })).toBe(true);
  });

  it("each task has a human-readable reason", () => {
    const tasks = generateTasks(config, topics, new Map());
    for (const task of tasks) {
      expect(task.reason.length).toBeGreaterThan(0);
    }
  });

  it("generates explore tasks when topics have no mastery data", () => {
    const noDataTopics: EligibleTopic[] = [
      {
        ...baseTopic,
        quizMastery: null,
        flashcardEngagement: null,
        topicLabel: "Unknown",
        targetId: "q1",
      },
    ];
    const tasks = generateTasks(config, noDataTopics, new Map());
    expect(tasks.length).toBeGreaterThan(0);
  });
});
