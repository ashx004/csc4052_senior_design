import { describe, expect, it } from "vitest";
import {
  attachFirstDocument,
  DEFAULT_AUTO_PLAN_CONFIG,
  remainingMinutesAfterCarryover,
  shouldAutoPlan,
  startOfWeekDateString,
  weakCoursesNeedingTask,
} from "./autoPlan";
import type { EligibleTopic, GeneratedTask } from "./types";

function topic(courseId: string, quizMastery: number | null, label = "T"): EligibleTopic {
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

describe("DEFAULT_AUTO_PLAN_CONFIG", () => {
  it("matches the existing carryover default", () => {
    expect(DEFAULT_AUTO_PLAN_CONFIG).toEqual({
      availableMinutes: 60,
      goal: "general",
      courseId: null,
      activityPreference: "auto",
    });
  });
});

describe("startOfWeekDateString", () => {
  it("returns the Monday of the same week", () => {
    expect(startOfWeekDateString(new Date(2026, 9, 7))).toBe("2026-10-05"); // Wed
  });
  it("returns the same day for a Monday", () => {
    expect(startOfWeekDateString(new Date(2026, 9, 5))).toBe("2026-10-05");
  });
  it("treats Sunday as the end of the week", () => {
    expect(startOfWeekDateString(new Date(2026, 9, 4))).toBe("2026-09-28"); // Sun
  });
});

describe("remainingMinutesAfterCarryover", () => {
  it("subtracts carried task minutes", () => {
    expect(remainingMinutesAfterCarryover(60, [{ estimatedMinutes: 20 }, { estimatedMinutes: 15 }])).toBe(25);
  });
  it("never goes below zero", () => {
    expect(remainingMinutesAfterCarryover(60, [{ estimatedMinutes: 50 }, { estimatedMinutes: 20 }])).toBe(0);
  });
  it("returns the full budget with nothing carried", () => {
    expect(remainingMinutesAfterCarryover(60, [])).toBe(60);
  });
});

describe("weakCoursesNeedingTask", () => {
  it("returns weak courses with no task this week", () => {
    const topics = [topic("A", 0.3), topic("B", 0.9), topic("C", 0.5)];
    expect(weakCoursesNeedingTask(topics, [{ courseId: "C" }])).toEqual(["A"]);
  });
  it("ignores courses whose mastery is unknown", () => {
    expect(weakCoursesNeedingTask([topic("A", null)], [])).toEqual([]);
  });
  it("lists each course once", () => {
    expect(weakCoursesNeedingTask([topic("A", 0.2, "x"), topic("A", 0.1, "y")], [])).toEqual(["A"]);
  });
});

describe("shouldAutoPlan", () => {
  const base = { hasUser: true, dataReady: true, hasUsablePlan: false, alreadyAttempted: false };
  it("runs when data is ready and there is no usable plan", () => {
    expect(shouldAutoPlan(base)).toBe(true);
  });
  it("does not run without a user", () => {
    expect(shouldAutoPlan({ ...base, hasUser: false })).toBe(false);
  });
  it("waits for data", () => {
    expect(shouldAutoPlan({ ...base, dataReady: false })).toBe(false);
  });
  it("does not replace a usable plan", () => {
    expect(shouldAutoPlan({ ...base, hasUsablePlan: true })).toBe(false);
  });
  it("runs at most once per page load", () => {
    expect(shouldAutoPlan({ ...base, alreadyAttempted: true })).toBe(false);
  });
});

describe("attachFirstDocument", () => {
  const base: GeneratedTask = {
    title: "t",
    courseId: "A",
    courseName: "A",
    courseCode: "A",
    topicLabel: "x",
    activityType: "reading",
    targetId: null,
    estimatedMinutes: 15,
    reason: "r",
    priorityScore: 1,
  };
  const resources = new Map([
    ["A", [{ id: "r1", name: "one", sourceDocKey: "k1" }, { id: "r2", name: "two", sourceDocKey: "k2" }]],
  ]);

  it("attaches the first resource to a reading task needing a document", () => {
    const [out] = attachFirstDocument([base], resources);
    expect(out.targetId).toBe("r1");
    expect(out.activityTarget).toEqual({ kind: "document", resourceId: "r1", sourceDocKey: "k1" });
  });

  it("drops a reading task when its course has no resources", () => {
    expect(attachFirstDocument([{ ...base, courseId: "B" }], resources)).toEqual([]);
  });

  it("leaves non-reading and already-targeted tasks unchanged", () => {
    const quiz = { ...base, activityType: "quiz" as const };
    const targeted = {
      ...base,
      targetId: "z",
      activityTarget: { kind: "document" as const, resourceId: "z", sourceDocKey: "kz" },
    };
    expect(attachFirstDocument([quiz, targeted], resources)).toEqual([quiz, targeted]);
  });
});
