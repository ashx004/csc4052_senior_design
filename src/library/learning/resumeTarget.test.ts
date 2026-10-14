import { describe, expect, it } from "vitest";
import { selectLearningResumeTarget } from "./resumeTarget";

const nextTask = {
  id: "t1",
  title: "Review parsing",
  courseName: "Programming Language",
  courseId: "c1",
  targetId: "doc1",
  estimatedMinutes: 20,
  totalActiveMinutes: 5,
  activityType: "reading" as const,
  activityTarget: {
    kind: "document" as const,
    resourceId: "doc1",
    sourceDocKey: "doc1",
  },
};

describe("selectLearningResumeTarget", () => {
  it("prefers an in-progress plan task", () => {
    const result = selectLearningResumeTarget({
      nextTask,
      recentClass: { id: "c2", name: "Database", studiedAtMillis: 20 },
    });
    expect(result).toMatchObject({
      title: "Review parsing",
      context: "Programming Language",
      remainingMinutes: 15,
    });
    expect(result?.href).toContain("/courses/c1");
  });

  it("never reports negative remaining minutes", () => {
    const result = selectLearningResumeTarget({
      nextTask: { ...nextTask, totalActiveMinutes: 50 },
      recentClass: null,
    });
    expect(result?.remainingMinutes).toBe(0);
  });

  it("falls back to the most recent class and returns null without either source", () => {
    expect(selectLearningResumeTarget({
      nextTask: null,
      recentClass: { id: "c2", name: "Database", studiedAtMillis: 20 },
    })).toEqual({ title: "Continue Database", context: "Recent class activity", href: "/courses/c2/learning" });
    expect(selectLearningResumeTarget({ nextTask: null, recentClass: null })).toBeNull();
  });
});
