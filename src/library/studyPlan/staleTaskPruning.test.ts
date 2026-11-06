import { describe, expect, it } from "vitest";
import { classifyTask, partitionPlanTasks } from "./staleTaskPruning";

const contents = {
  resources: [{ id: "res-1", sourceDocKey: "uploads/a.pdf" }],
  quizSetIds: new Set(["quiz-1"]),
  flashcardSetIds: new Set(["fc-1"]),
};
const recommended = { status: "recommended" as const };

describe("classifyTask", () => {
  it("is openable for a document target that still exists", () => {
    expect(classifyTask({ ...recommended, activityType: "reading", targetId: "res-1",
      activityTarget: { kind: "document", resourceId: "res-1", sourceDocKey: "uploads/a.pdf" } }, contents)).toBe("openable");
  });

  it("is stale for a document target whose resource is gone", () => {
    expect(classifyTask({ ...recommended, activityType: "reading", targetId: "res-9",
      activityTarget: { kind: "document", resourceId: "res-9", sourceDocKey: "uploads/gone.pdf" } }, contents)).toBe("stale");
  });

  it("matches a resource through an encoded source key", () => {
    expect(classifyTask({ ...recommended, activityType: "reading", targetId: "res-1",
      activityTarget: { kind: "document", resourceId: "res-1", sourceDocKey: "/api/download?key=uploads%2Fa.pdf" } }, contents)).toBe("openable");
  });

  it("is stale for a reading task whose bare targetId is gone", () => {
    expect(classifyTask({ ...recommended, activityType: "reading", targetId: "res-9" }, contents)).toBe("stale");
  });

  it("is stale for a quiz target whose set is gone", () => {
    expect(classifyTask({ ...recommended, activityType: "quiz", targetId: "quiz-9",
      activityTarget: { kind: "quiz", quizId: "quiz-9", sourceDocKey: null, mode: "full" } }, contents)).toBe("stale");
  });

  it("is stale for a flashcard_set target whose set is gone", () => {
    expect(classifyTask({ ...recommended, activityType: "flashcards", targetId: "fc-9",
      activityTarget: { kind: "flashcard_set", setId: "fc-9", sourceDocKey: null } }, contents)).toBe("stale");
  });

  const conceptTarget = (over = {}) => ({
    kind: "concept_practice" as const, conceptKeys: ["k"], conceptLabels: ["K"], conceptLevels: {},
    sourceDocKeys: ["uploads/a.pdf"], practiceType: "quiz" as const, questionCount: 10,
    generatedSetId: null as string | null, generationClaimedAtMs: null, ...over,
  });

  it("is openable for an ungenerated concept_practice task with a live document", () => {
    expect(classifyTask({ ...recommended, activityType: "quiz", targetId: null, activityTarget: conceptTarget() }, contents)).toBe("openable");
  });

  it("is stale for a concept_practice task with no source documents", () => {
    expect(classifyTask({ ...recommended, activityType: "quiz", targetId: null,
      activityTarget: conceptTarget({ sourceDocKeys: [] }) }, contents)).toBe("stale");
  });

  it("is stale for a concept_practice task whose documents are all gone", () => {
    expect(classifyTask({ ...recommended, activityType: "quiz", targetId: null,
      activityTarget: conceptTarget({ sourceDocKeys: ["uploads/gone.pdf"] }) }, contents)).toBe("stale");
  });

  it("asks for regeneration when the generated set is gone", () => {
    expect(classifyTask({ ...recommended, activityType: "quiz", targetId: null,
      activityTarget: conceptTarget({ generatedSetId: "quiz-9" }) }, contents)).toBe("regenerate");
  });

  it("is openable when the generated set still exists", () => {
    expect(classifyTask({ ...recommended, activityType: "quiz", targetId: null,
      activityTarget: conceptTarget({ generatedSetId: "quiz-1" }) }, contents)).toBe("openable");
  });

  it("is openable for a targetless ai_explanation task", () => {
    expect(classifyTask({ ...recommended, activityType: "ai_explanation", targetId: null }, contents)).toBe("openable");
  });

  it("is unknown when the course read failed", () => {
    expect(classifyTask({ ...recommended, activityType: "reading", targetId: "res-9" }, null)).toBe("unknown");
  });

  it("is openable for a completed task whose document is gone", () => {
    expect(classifyTask({ status: "completed", activityType: "reading", targetId: "res-9" }, contents)).toBe("openable");
  });

  it("is openable for a skipped task whose document is gone", () => {
    expect(classifyTask({ status: "skipped", activityType: "reading", targetId: "res-9" }, contents)).toBe("openable");
  });
});

describe("partitionPlanTasks", () => {
  it("separates stale ids from regeneration ids and leaves unknowns alone", () => {
    const byCourse = new Map([["bio201", contents], ["csc430", null]]);
    const result = partitionPlanTasks([
      { id: "t1", courseId: "bio201", status: "recommended", activityType: "reading", targetId: "res-9" },
      { id: "t2", courseId: "bio201", status: "in_progress", activityType: "reading", targetId: "res-1" },
      { id: "t3", courseId: "csc430", status: "recommended", activityType: "reading", targetId: "res-9" },
    ], byCourse);
    expect(result).toEqual({ staleIds: ["t1"], regenerateIds: [] });
  });

  it("treats a course missing from the map as unknown", () => {
    const result = partitionPlanTasks(
      [{ id: "t1", courseId: "bio201", status: "recommended", activityType: "reading", targetId: "res-9" }],
      new Map(),
    );
    expect(result).toEqual({ staleIds: [], regenerateIds: [] });
  });
});

describe("protecting work a student can still do", () => {
  const live = {
    resources: [{ id: "res-1", sourceDocKey: "uploads/a.pdf" }],
    quizSetIds: new Set(["quiz-1"]),
    flashcardSetIds: new Set(["fc-1"]),
  };
  const concept = (over = {}) => ({
    kind: "concept_practice" as const, conceptKeys: ["k"], conceptLabels: ["K"], conceptLevels: {},
    sourceDocKeys: ["uploads/a.pdf"], practiceType: "quiz" as const, questionCount: 10,
    generatedSetId: null as string | null, generationClaimedAtMs: null, ...over,
  });

  it("keeps a task whose generated set still exists even when every source document is gone", () => {
    // The set check must run before the document check, or a usable generated set is deleted with its task.
    expect(classifyTask({ status: "recommended", activityType: "quiz", targetId: null,
      activityTarget: concept({ generatedSetId: "quiz-1", sourceDocKeys: ["uploads/gone.pdf"] }) }, live)).toBe("openable");
  });

  it("never asks to regenerate a set of a practice type the snapshot cannot verify", () => {
    // fill_blank sets are in neither id set; absence proves nothing, so the task is left alone.
    expect(classifyTask({ status: "recommended", activityType: "quiz", targetId: null,
      activityTarget: concept({ practiceType: "fill_blank", generatedSetId: "practice-9" }) }, live)).toBe("openable");
  });

  it("never prunes a rescheduled task, even when its document is gone", () => {
    expect(classifyTask({ status: "rescheduled", activityType: "reading", targetId: "res-9" }, live)).toBe("openable");
  });

  it("reports a regenerate verdict in regenerateIds and not in staleIds", () => {
    const result = partitionPlanTasks([
      { id: "t1", courseId: "bio201", status: "recommended", activityType: "quiz", targetId: null,
        activityTarget: concept({ generatedSetId: "quiz-9" }) },
    ], new Map([["bio201", live]]));
    expect(result).toEqual({ staleIds: [], regenerateIds: ["t1"] });
  });
});
