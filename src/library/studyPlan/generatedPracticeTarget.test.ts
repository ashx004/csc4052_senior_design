import { describe, expect, it } from "vitest";
import { buildGeneratedPracticeTarget, topicSourceDocKey } from "./generatedPracticeTarget";
import type { EligibleTopic } from "./types";

const base: EligibleTopic = {
  courseId: "bio201", courseName: "Biology", courseCode: "BIO201",
  topicLabel: "03-cell-respiration.pdf", targetId: null, activityType: "reading",
  quizMastery: null, flashcardEngagement: null, lastStudiedAt: null, skipCount: 0,
  activityTarget: { kind: "document", resourceId: "res-1", sourceDocKey: "uploads/03-cell-respiration.pdf" },
};

describe("topicSourceDocKey", () => {
  it("reads the key from a document target", () => {
    expect(topicSourceDocKey(base)).toBe("uploads/03-cell-respiration.pdf");
  });

  it("reads the first key from a concept_practice target", () => {
    expect(topicSourceDocKey({ activityTarget: {
      kind: "concept_practice", conceptKeys: [], conceptLabels: [], conceptLevels: {},
      sourceDocKeys: ["uploads/a.pdf", "uploads/b.pdf"], practiceType: "quiz",
      questionCount: 10, generatedSetId: null, generationClaimedAtMs: null,
    } })).toBe("uploads/a.pdf");
  });

  it("is null without a target", () => {
    expect(topicSourceDocKey({})).toBeNull();
  });

  it("is null for an empty key", () => {
    expect(topicSourceDocKey({ activityTarget: { kind: "document", resourceId: "r", sourceDocKey: "" } })).toBeNull();
  });
});

describe("buildGeneratedPracticeTarget", () => {
  it("builds a quiz target with one quota named from the document", () => {
    const target = buildGeneratedPracticeTarget(base, "quiz");
    expect(target).toEqual({
      kind: "concept_practice",
      conceptKeys: [expect.any(String)],
      conceptLabels: ["Cell Respiration"],
      conceptLevels: {},
      sourceDocKeys: ["uploads/03-cell-respiration.pdf"],
      practiceType: "quiz",
      questionCount: 10,
      generatedSetId: null,
      generationClaimedAtMs: null,
    });
  });

  it("uses the topic label as-is when it is not a filename", () => {
    const target = buildGeneratedPracticeTarget({ ...base, topicLabel: "SQL Joins" }, "quiz");
    expect(target?.conceptLabels).toEqual(["SQL Joins"]);
  });

  it("builds a flashcards target", () => {
    expect(buildGeneratedPracticeTarget(base, "flashcards")?.practiceType).toBe("flashcards");
  });

  it("is null when the topic has no source document", () => {
    expect(buildGeneratedPracticeTarget({ ...base, activityTarget: undefined }, "quiz")).toBeNull();
  });
});
