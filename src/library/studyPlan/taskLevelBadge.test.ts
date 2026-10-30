import { describe, expect, it } from "vitest";
import type { ActivityTarget } from "./types";
import { taskLevelBadge } from "./taskLevelBadge";

function practice(conceptLevels?: Record<string, "review" | "exam" | "challenge">): ActivityTarget {
  return {
    kind: "concept_practice",
    conceptKeys: ["a", "b"],
    conceptLabels: ["A", "B"],
    sourceDocKeys: [],
    practiceType: "quiz",
    questionCount: 10,
    conceptLevels: conceptLevels as Record<string, "review" | "exam" | "challenge">,
    generatedSetId: null,
    generationClaimedAtMs: null,
  };
}

describe("taskLevelBadge", () => {
  it("labels a leveled quiz task with its level", () => {
    expect(taskLevelBadge(practice({ a: "review", b: "review" }))).toBe("Review");
  });

  it("shows the highest level when concepts have mixed levels", () => {
    expect(taskLevelBadge(practice({ a: "review", b: "challenge" }))).toBe("Challenge");
  });

  it("shows the highest level when it comes first in the map", () => {
    expect(taskLevelBadge(practice({ a: "challenge", b: "review" }))).toBe("Challenge");
  });

  it("shows the highest level when it is neither first nor last", () => {
    expect(taskLevelBadge(practice({ a: "review", b: "challenge", c: "exam" }))).toBe("Challenge");
  });

  it("labels an exam-only map as Exam-style, not Exam", () => {
    expect(taskLevelBadge(practice({ a: "exam", b: "exam" }))).toBe("Exam-style");
  });

  it("shows nothing for a quiz task with no per-concept level", () => {
    expect(taskLevelBadge(practice({}))).toBeNull();
  });

  it("shows nothing for a legacy target saved before conceptLevels existed", () => {
    // legacy: the conceptLevels field is absent at runtime, which the cast in practice() hides.
    expect(taskLevelBadge(practice(undefined))).toBeNull();
  });

  it("shows nothing for a non-quiz task", () => {
    expect(taskLevelBadge({ kind: "flashcard_set", setId: "s1", sourceDocKey: null })).toBeNull();
  });

  it("shows nothing when the task has no activity target", () => {
    expect(taskLevelBadge(null)).toBeNull();
  });
});
