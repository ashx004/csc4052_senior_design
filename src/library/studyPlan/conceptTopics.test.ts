import { describe, expect, it } from "vitest";
import { conceptTopicsFromWeakSpots } from "./conceptTopics";
import { generateTasks } from "./recommendationEngine";
import type { ActivityTarget, ConceptWeakSpot, SetupConfig } from "./types";

const planConfig = (activityPreference: SetupConfig["activityPreference"]): SetupConfig => ({
  availableMinutes: 60,
  goal: "general",
  courseId: null,
  activityPreference,
});

function open(key: string, label: string, missCount: number): ConceptWeakSpot {
  return {
    courseId: "math201",
    conceptKey: key,
    label,
    misses: Array.from({ length: missCount }, (_, index) => ({
      questionId: `q${index + 1}`,
      quizId: "quiz1",
      failureCount: 1,
    })),
    sourceDocKeys: ["users/u/resources/calc.pdf"],
    status: "open",
    openedAtMs: 1_000,
    retiredAtMs: null,
    timesReopened: 0,
  };
}

describe("conceptTopicsFromWeakSpots", () => {
  it("asks a weak concept at review rather than the exam default", () => {
    const mastery = new Map([["chain rule", { value: 30, lastAskedLevel: "exam" as const }]]);
    const topics = conceptTopicsFromWeakSpots([open("chain rule", "Chain Rule", 1)], "Calculus", "MATH 201", {
      conceptMastery: mastery,
      daysUntilExam: null,
    });

    const target = topics[0].activityTarget as Extract<ActivityTarget, { kind: "concept_practice" }>;
    expect(target.conceptLevels).toEqual({ "chain rule": "review" });
  });

  it("holds a repeatedly missed concept at review even with an exam in two days", () => {
    const spot = open("chain rule", "Chain Rule", 2);
    spot.misses = spot.misses.map((miss) => ({ ...miss, failureCount: 2 }));
    const mastery = new Map([["chain rule", { value: 70, lastAskedLevel: "exam" as const }]]);
    const topics = conceptTopicsFromWeakSpots([spot], "Calculus", "MATH 201", {
      conceptMastery: mastery,
      daysUntilExam: 2,
    });

    const target = topics[0].activityTarget as Extract<ActivityTarget, { kind: "concept_practice" }>;
    expect(target.conceptLevels).toEqual({ "chain rule": "review" });
  });

  it("leaves conceptLevels empty when no mastery is supplied, keeping today's behaviour", () => {
    const topics = conceptTopicsFromWeakSpots([open("chain rule", "Chain Rule", 1)], "Calculus", "MATH 201");

    const target = topics[0].activityTarget as Extract<ActivityTarget, { kind: "concept_practice" }>;
    expect(target.conceptLevels).toEqual({});
  });


  it("turns each open weak spot into a candidate carrying its concept label", () => {
    const topics = conceptTopicsFromWeakSpots([open("chain rule", "Chain Rule", 3)], "Calculus", "MATH 201");
    expect(topics).toHaveLength(1);
    expect(topics[0].conceptLabel).toBe("Chain Rule");
    expect(topics[0].topicLabel).toBe("Chain Rule");
  });

  it("leaves retired weak spots out, so a cleared concept stops coming back", () => {
    const retired = { ...open("chain rule", "Chain Rule", 3), status: "retired" as const };
    expect(conceptTopicsFromWeakSpots([retired], "Calculus", "MATH 201")).toEqual([]);
  });

  it("attaches a concept_practice target built from the weak spot", () => {
    const [topic] = conceptTopicsFromWeakSpots([open("chain rule", "Chain Rule", 2)], "Calculus", "MATH 201");
    expect(topic.activityType).toBe("quiz");
    expect(topic.activityTarget).toEqual({
      kind: "concept_practice",
      conceptKeys: ["chain rule"],
      conceptLabels: ["Chain Rule"],
      sourceDocKeys: ["users/u/resources/calc.pdf"],
      practiceType: "quiz",
      questionCount: 6,
      conceptLevels: {},
      generatedSetId: null,
      generationClaimedAtMs: null,
    });
  });

  it("keeps questionCount between 3 and 12", () => {
    const count = (misses: number) => {
      const [topic] = conceptTopicsFromWeakSpots([open("k", "K", misses)], "C", "C 1");
      return topic.activityTarget?.kind === "concept_practice" ? topic.activityTarget.questionCount : -1;
    };
    expect(count(0)).toBe(3);
    expect(count(1)).toBe(3);
    expect(count(3)).toBe(9);
    expect(count(10)).toBe(12);
  });

  it("carries repeat misses through as repeatMissCount so priority rises", () => {
    const spot = open("chain rule", "Chain Rule", 2);
    spot.misses[0].failureCount = 3;
    expect(conceptTopicsFromWeakSpots([spot], "Calculus", "MATH 201")[0].repeatMissCount).toBeGreaterThan(0);
  });
});

describe("concept topics through generateTasks", () => {
  const topics = conceptTopicsFromWeakSpots([open("chain rule", "Chain Rule", 2)], "Calculus", "MATH 201");

  for (const preference of ["auto", "reading", "quiz", "flashcards"] as const) {
    it(`names the concept and stays a concept quiz, not reading (${preference})`, () => {
      const tasks = generateTasks(planConfig(preference), topics, new Map());
      expect(tasks).toHaveLength(1);
      expect(tasks[0].reason).toContain("Chain Rule");
      expect(tasks[0].activityType).not.toBe("reading");
      expect(tasks[0].activityType).toBe("quiz");
      expect(tasks[0].activityTarget?.kind).toBe("concept_practice");
    });
  }

  it("still plans a concept topic for the weak_topics goal", () => {
    const tasks = generateTasks({ ...planConfig("auto"), goal: "weak_topics" }, topics, new Map());
    expect(tasks).toHaveLength(1);
  });
});
