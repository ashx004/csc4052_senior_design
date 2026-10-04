import { describe, expect, it } from "vitest";
import {
  scoreTopic,
  generateTasks,
  chooseActivityType,
  ESTIMATED_MINUTES,
  needsDocumentSelection,
  documentTargetForResource,
  findResourceForSourceDocKey,
} from "./recommendationEngine";
import type { EligibleTopic, GeneratedTask, SetupConfig } from "./types";

function config(activityPreference: SetupConfig["activityPreference"]): SetupConfig {
  return {
    availableMinutes: 60,
    goal: "general",
    courseId: null,
    activityPreference,
  };
}

function documentCandidate(resourceId: string): EligibleTopic {
  return {
    ...baseTopic,
    topicLabel: "Lecture notes",
    targetId: null,
    activityType: "reading",
    activityTarget: {
      kind: "document",
      resourceId,
      sourceDocKey: "users/u/resources/doc.pdf",
    },
  };
}

function generatedReadingWithoutTarget(): GeneratedTask {
  return {
    title: "Read: Course exploration",
    courseId: "csc430",
    courseName: "Database Systems",
    courseCode: "CSC430",
    topicLabel: "Course exploration",
    activityType: "reading",
    targetId: null,
    estimatedMinutes: 20,
    reason: "Explore the course",
    priorityScore: 10,
  };
}

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

  it("does not give unknown quiz mastery the weak-document score", () => {
    const scored = scoreTopic({ ...baseTopic, quizMastery: null }, null, false);
    expect(scored.factors.lowQuizMastery).toBe(0);
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

  it("keeps a flashcard set as flashcards when only document mastery is known", () => {
    expect(
      chooseActivityType(
        {
          ...baseTopic,
          activityType: "flashcards",
          targetId: "set-1",
          quizMastery: 0.42,
          flashcardEngagement: null,
        },
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

  it("does not select an all-unknown topic as weak", () => {
    const tasks = generateTasks(
      { ...config, goal: "weak_topics" },
      [
        {
          ...baseTopic,
          topicLabel: "Known weak",
          targetId: "q1",
          quizMastery: 0.2,
          flashcardEngagement: null,
        },
        {
          ...baseTopic,
          topicLabel: "Unknown",
          targetId: "q2",
          quizMastery: null,
          flashcardEngagement: null,
        },
      ],
      new Map()
    );
    expect(tasks.map((task) => task.topicLabel)).toEqual(["Known weak"]);
  });
});

describe("generateTasks options", () => {
  const cfg = { availableMinutes: 60 as const, goal: "general" as const, courseId: null, activityPreference: "quiz" as const };
  function quizTopic(courseId: string, label: string, quizMastery: number | null): EligibleTopic {
    return {
      courseId,
      courseName: courseId,
      courseCode: courseId,
      topicLabel: label,
      targetId: `${courseId}-${label}`,
      activityType: "quiz",
      quizMastery,
      flashcardEngagement: null,
      lastStudiedAt: null,
      skipCount: 0,
    };
  }

  it("uses minutesBudget instead of availableMinutes", () => {
    const topics = [quizTopic("A", "a1", 0.2), quizTopic("B", "b1", 0.2), quizTopic("C", "c1", 0.2)];
    const tasks = generateTasks(cfg, topics, new Map(), { minutesBudget: 25 });
    expect(tasks).toHaveLength(1); // one 20-minute quiz fits in 25 minutes
  });

  it("returns nothing when the budget is 0", () => {
    expect(generateTasks(cfg, [quizTopic("A", "a1", 0.2)], new Map(), { minutesBudget: 0 })).toEqual([]);
  });

  it("forces a guaranteed course in even when it scores lowest", () => {
    const topics = [
      quizTopic("A", "a1", 0.1),
      quizTopic("B", "b1", 0.1),
      quizTopic("C", "c1", 0.1),
      quizTopic("D", "d1", 0.55), // weakest score of the four
    ];
    const tasks = generateTasks(cfg, topics, new Map(), { guaranteedCourseIds: ["D"] });
    expect(tasks[0].courseId).toBe("D");
    expect(tasks.map((t) => t.courseId)).toContain("D");
  });

  it("does not add a guaranteed course twice", () => {
    const topics = [
      quizTopic("A", "a1", 0.1),
      quizTopic("B", "b1", 0.1),
      quizTopic("C", "c1", 0.1),
      quizTopic("D", "d1", 0.55),
      quizTopic("D", "d2", 0.6),
    ];
    const tasks = generateTasks(cfg, topics, new Map(), { guaranteedCourseIds: ["D"] });
    const pairs = tasks.map((t) => `${t.courseId}/${t.topicLabel}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(pairs.filter((p) => p === "D/d1")).toHaveLength(1);
  });

  it("behaves as before with no options", () => {
    const topics = [quizTopic("A", "a1", 0.1), quizTopic("B", "b1", 0.3)];
    const tasks = generateTasks(cfg, topics, new Map());
    expect(tasks.map((t) => [t.courseId, t.topicLabel, t.activityType])).toEqual([
      ["A", "a1", "quiz"],
      ["B", "b1", "quiz"],
    ]);
  });

  it("does not start the reading+quiz+flashcards trio when the budget is under it", () => {
    const autoCfg = { ...cfg, activityPreference: "auto" as const };
    const topics: EligibleTopic[] = [
      { ...quizTopic("A", "a1", 0.1), activityType: "quiz" },
      { ...quizTopic("A", "a2", 0.2), activityType: "flashcards", targetId: "A-fc" },
      { ...quizTopic("A", "a3", 0.3), activityType: "reading", targetId: "A-rd" },
    ];
    const tasks = generateTasks(autoCfg, topics, new Map(), { minutesBudget: 30 });
    const total = tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
    expect(total).toBeLessThanOrEqual(30);
    expect(tasks.map((t) => [t.activityType, t.topicLabel])).toEqual([["quiz", "a1"]]);
  });
});

describe("document mastery priority", () => {
  const quiet = { quizMastery: null as number | null, flashcardEngagement: null as number | null };

  it("gives high weak-document priority for mastery 0–59", () => {
    const floor = scoreTopic({ ...baseTopic, ...quiet, quizMastery: 0 }, null, false);
    const ceiling = scoreTopic({ ...baseTopic, ...quiet, quizMastery: 0.59 }, null, false);
    const review = scoreTopic({ ...baseTopic, ...quiet, quizMastery: 0.6 }, null, false);
    expect(floor.factors.lowQuizMastery).toBe(25);
    expect(ceiling.factors.lowQuizMastery).toBe(15);
    expect(floor.factors.lowQuizMastery).toBeGreaterThan(review.factors.lowQuizMastery);
    expect(ceiling.factors.lowQuizMastery).toBeGreaterThan(review.factors.lowQuizMastery);
  });

  it("gives a smaller review priority for mastery 60–79", () => {
    const start = scoreTopic({ ...baseTopic, ...quiet, quizMastery: 0.6 }, null, false);
    const end = scoreTopic({ ...baseTopic, ...quiet, quizMastery: 0.79 }, null, false);
    expect(start.factors.lowQuizMastery).toBe(5);
    expect(end.factors.lowQuizMastery).toBe(5);
  });

  it("gives no weak-topic priority for mastery 80–100", () => {
    expect(
      scoreTopic({ ...baseTopic, ...quiet, quizMastery: 0.8 }, null, false).factors.lowQuizMastery
    ).toBe(0);
    expect(
      scoreTopic({ ...baseTopic, ...quiet, quizMastery: 1 }, null, false).factors.lowQuizMastery
    ).toBe(0);
  });

  it("treats unknown mastery as exploration instead of score 0", () => {
    const scored = scoreTopic({ ...baseTopic, ...quiet }, null, false);
    expect(scored.factors.lowQuizMastery).toBe(0);
    expect(scored.factors.lowFlashcardEngagement).toBe(0);
    expect(scored.totalScore).toBe(scored.factors.baseScore);
  });

  it("uses last studied time for staleness without treating it as mastery", () => {
    const studiedAt = { toMillis: () => Date.now() - 15 * 24 * 60 * 60 * 1000 };
    const scored = scoreTopic(
      { ...baseTopic, ...quiet, lastStudiedAt: studiedAt as EligibleTopic["lastStudiedAt"] },
      null,
      false
    );
    expect(scored.factors.lowQuizMastery).toBe(0);
    expect(scored.factors.lowFlashcardEngagement).toBe(0);
    expect(scored.factors.staleReview).toBe(15);
  });

  it("raises a repeat-miss topic above the same topic and caps the bonus", () => {
    const plain = scoreTopic(
      { ...baseTopic, quizMastery: 0.9, flashcardEngagement: 0.9 },
      null,
      false
    );
    const once = scoreTopic(
      { ...baseTopic, quizMastery: 0.9, flashcardEngagement: 0.9, repeatMissCount: 1 },
      null,
      false
    );
    const atCap = scoreTopic(
      { ...baseTopic, quizMastery: 0.9, flashcardEngagement: 0.9, repeatMissCount: 3 },
      null,
      false
    );
    const aboveCap = scoreTopic(
      { ...baseTopic, quizMastery: 0.9, flashcardEngagement: 0.9, repeatMissCount: 50 },
      null,
      false
    );
    expect(once.totalScore).toBeGreaterThan(plain.totalScore);
    expect(atCap.totalScore).toBeGreaterThan(once.totalScore);
    expect(aboveCap.totalScore).toBe(atCap.totalScore);
    expect(aboveCap.totalScore - plain.totalScore).toBe(15);
  });
});

describe("reading document targets", () => {
  it("keeps a specific document target on a reading recommendation", () => {
    const tasks = generateTasks(config("reading"), [documentCandidate("resource-1")], new Map());
    expect(tasks[0].activityTarget).toEqual({
      kind: "document",
      resourceId: "resource-1",
      sourceDocKey: "users/u/resources/doc.pdf",
    });
  });

  it("keeps a document target when reading is assigned inside a mixed plan", () => {
    const tasks = generateTasks(
      config("auto"),
      [
        documentCandidate("resource-1"),
        { ...baseTopic, topicLabel: "Joins quiz", activityType: "quiz", targetId: "q1" },
        { ...baseTopic, topicLabel: "Joins cards", activityType: "flashcards", targetId: "f1" },
      ],
      new Map()
    );
    const reading = tasks.find((task) => task.activityType === "reading");
    expect(reading?.activityTarget).toEqual({
      kind: "document",
      resourceId: "resource-1",
      sourceDocKey: "users/u/resources/doc.pdf",
    });
    expect(reading?.targetId).toBe("resource-1");
  });

  it("points a matched quiz at its document when the task becomes reading", () => {
    const tasks = generateTasks(
      { ...config("auto"), availableMinutes: 30 },
      [
        {
          ...baseTopic,
          quizMastery: null,
          flashcardEngagement: null,
          activityType: "quiz",
          targetId: "quiz-1",
          activityTarget: {
            kind: "document",
            resourceId: "resource-1",
            sourceDocKey: "users/u/resources/doc.pdf",
          },
        },
      ],
      new Map()
    );
    expect(tasks[0].activityType).toBe("reading");
    expect(tasks[0].targetId).toBe("resource-1");
    expect(tasks[0].activityTarget).toEqual({
      kind: "document",
      resourceId: "resource-1",
      sourceDocKey: "users/u/resources/doc.pdf",
    });
  });

  it("keeps the quiz id when a matched quiz stays a quiz", () => {
    const tasks = generateTasks(
      { ...config("quiz"), availableMinutes: 30 },
      [
        {
          ...baseTopic,
          activityType: "quiz",
          targetId: "quiz-1",
          activityTarget: {
            kind: "document",
            resourceId: "resource-1",
            sourceDocKey: "users/u/resources/doc.pdf",
          },
        },
      ],
      new Map()
    );
    expect(tasks[0].activityType).toBe("quiz");
    expect(tasks[0].targetId).toBe("quiz-1");
    expect(tasks[0].activityTarget).toEqual({
      kind: "quiz",
      quizId: "quiz-1",
      sourceDocKey: "users/u/resources/doc.pdf",
      mode: "full",
    });
  });

  it("keeps the set id when a matched flashcard set stays flashcards", () => {
    const tasks = generateTasks(
      { ...config("flashcards"), availableMinutes: 30 },
      [
        {
          ...baseTopic,
          activityType: "flashcards",
          targetId: "set-1",
          activityTarget: {
            kind: "document",
            resourceId: "resource-1",
            sourceDocKey: "users/u/resources/doc.pdf",
          },
        },
      ],
      new Map()
    );
    expect(tasks[0].activityType).toBe("flashcards");
    expect(tasks[0].targetId).toBe("set-1");
    expect(tasks[0].activityTarget).toEqual({
      kind: "flashcard_set",
      setId: "set-1",
      sourceDocKey: "users/u/resources/doc.pdf",
    });
  });

  it("does not attach a flashcard target when a matched quiz is generated as flashcards", () => {
    const tasks = generateTasks(
      { ...config("flashcards"), availableMinutes: 30 },
      [
        {
          ...baseTopic,
          activityType: "quiz",
          targetId: "quiz-1",
          activityTarget: {
            kind: "document",
            resourceId: "resource-1",
            sourceDocKey: "users/u/resources/doc.pdf",
          },
        },
      ],
      new Map()
    );
    expect(tasks[0].activityType).toBe("flashcards");
    expect(tasks[0].targetId).toBe("quiz-1");
    expect(tasks[0].activityTarget).toBeUndefined();
  });
});

describe("needsDocumentSelection", () => {
  it("flags a targetless reading result for document selection instead of persisting it", () => {
    expect(needsDocumentSelection(generatedReadingWithoutTarget())).toBe(true);
  });

  it("does not flag a reading task that already names a document", () => {
    expect(
      needsDocumentSelection({
        ...generatedReadingWithoutTarget(),
        activityTarget: {
          kind: "document",
          resourceId: "resource-1",
          sourceDocKey: "users/u/resources/doc.pdf",
        },
      })
    ).toBe(false);
  });

  it("flags a reading task whose target is not a document", () => {
    expect(
      needsDocumentSelection({
        ...generatedReadingWithoutTarget(),
        activityTarget: {
          kind: "quiz",
          quizId: "quiz-1",
          sourceDocKey: null,
          mode: "full",
        },
      })
    ).toBe(true);
  });

  it("does not flag a quiz task", () => {
    expect(
      needsDocumentSelection({
        ...generatedReadingWithoutTarget(),
        activityType: "quiz",
      })
    ).toBe(false);
  });
});

describe("document target matching", () => {
  it("uses a stored sourceDocKey, then storageKey, then url", () => {
    expect(
      documentTargetForResource({
        id: "resource-1",
        sourceDocKey: " users/u/resources/doc.pdf ",
        storageKey: "users/u/resources/stored.pdf",
        url: "/api/download?key=other",
      })
    ).toEqual({
      kind: "document",
      resourceId: "resource-1",
      sourceDocKey: "users/u/resources/doc.pdf",
    });

    expect(
      documentTargetForResource({
        id: "resource-1",
        sourceDocKey: " ",
        storageKey: "users/u/resources/stored.pdf",
        url: "/api/download?key=other",
      }).sourceDocKey
    ).toBe("users/u/resources/stored.pdf");

    expect(
      documentTargetForResource({
        id: "resource-1",
        url: "/api/download?key=users%2Fu%2Fdoc.pdf",
      }).sourceDocKey
    ).toBe("/api/download?key=users%2Fu%2Fdoc.pdf");
  });

  it("matches a source key to a resource id, stored key, or url after trimming and decoding", () => {
    const resources = [
      {
        id: "resource-1",
        url: "/api/download?key=users%2Fu%2Fresources%2Fdoc.pdf",
      },
      {
        id: "resource-2",
        sourceDocKey: "users/u/resources/notes.pdf",
        url: "/api/download?key=unused",
      },
    ];

    expect(findResourceForSourceDocKey(" resource-1 ", resources)?.id).toBe("resource-1");
    expect(
      findResourceForSourceDocKey("users/u/resources/doc.pdf", resources)?.id
    ).toBe("resource-1");
    expect(
      findResourceForSourceDocKey(
        encodeURIComponent("users/u/resources/notes.pdf"),
        resources
      )?.id
    ).toBe("resource-2");
    expect(findResourceForSourceDocKey("   ", resources)).toBeUndefined();
  });
});
