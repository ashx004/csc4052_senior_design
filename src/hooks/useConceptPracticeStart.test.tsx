// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { StudyTask } from "@/src/library/studyPlan/types";

const mocks = vi.hoisted(() => ({
  askedQuestionTexts: vi.fn(),
  generateConceptQuiz: vi.fn(),
  claimTaskGeneration: vi.fn(),
  saveGeneratedSetId: vi.fn(),
  releaseTaskGeneration: vi.fn(),
}));

vi.mock("@/src/components/quizzes/weakConceptPractice", () => ({
  askedQuestionTexts: mocks.askedQuestionTexts,
  generateConceptQuiz: mocks.generateConceptQuiz,
}));
vi.mock("@/src/library/studyPlan/conceptPracticeTask", async () => {
  const actual = await vi.importActual<typeof import("@/src/library/studyPlan/conceptPracticeTask")>(
    "@/src/library/studyPlan/conceptPracticeTask",
  );
  return {
    ...actual,
    claimTaskGeneration: mocks.claimTaskGeneration,
    saveGeneratedSetId: mocks.saveGeneratedSetId,
    releaseTaskGeneration: mocks.releaseTaskGeneration,
  };
});
vi.mock("@/src/library/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({}));

import { DAILY_QUIZ_AVOID_SET_LIMIT } from "@/src/library/studyPlan/dailyQuizTarget";
import { BEING_PREPARED_MESSAGE, useConceptPracticeStart } from "./useConceptPracticeStart";

type Task = StudyTask & { id: string };

function task(targetOverrides: Record<string, unknown> = {}): Task {
  return {
    id: "t1",
    courseId: "c1",
    activityType: "quiz",
    targetId: "orig",
    activityTarget: {
      kind: "concept_practice",
      conceptKeys: ["joins"],
      conceptLabels: ["Joins"],
      sourceDocKeys: ["doc-1"],
      practiceType: "quiz",
      questionCount: 6,
      conceptLevels: { joins: "challenge" },
      generatedSetId: null,
      generationClaimedAtMs: null,
      ...targetOverrides,
    },
  } as unknown as Task;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.askedQuestionTexts.mockResolvedValue(["Old?"]);
  mocks.claimTaskGeneration.mockResolvedValue(true);
  mocks.generateConceptQuiz.mockResolvedValue("new-set");
  mocks.saveGeneratedSetId.mockResolvedValue(undefined);
  mocks.releaseTaskGeneration.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("useConceptPracticeStart", () => {
  it("returns the existing set without claiming or generating", async () => {
    const { result } = renderHook(() => useConceptPracticeStart("u1"));
    let id: string | null = null;
    await act(async () => {
      id = await result.current.ensureGeneratedSet(task({ generatedSetId: "set-1" }));
    });
    expect(id).toBe("set-1");
    expect(mocks.claimTaskGeneration).not.toHaveBeenCalled();
    expect(mocks.generateConceptQuiz).not.toHaveBeenCalled();
  });

  it("waits while a live claim exists: null, an error, no generation", async () => {
    const { result } = renderHook(() => useConceptPracticeStart("u1"));
    let id: string | null = "x";
    await act(async () => {
      id = await result.current.ensureGeneratedSet(task({ generationClaimedAtMs: Date.now() }));
    });
    expect(id).toBeNull();
    expect(result.current.error).toBe(BEING_PREPARED_MESSAGE);
    expect(mocks.claimTaskGeneration).not.toHaveBeenCalled();
    expect(mocks.generateConceptQuiz).not.toHaveBeenCalled();
  });

  it("returns null with an error when the task has no source document", async () => {
    const { result } = renderHook(() => useConceptPracticeStart("u1"));
    let id: string | null = "x";
    await act(async () => {
      id = await result.current.ensureGeneratedSet(task({ sourceDocKeys: [] }));
    });
    expect(id).toBeNull();
    expect(result.current.error).toBeTruthy();
    expect(mocks.claimTaskGeneration).not.toHaveBeenCalled();
    expect(mocks.generateConceptQuiz).not.toHaveBeenCalled();
  });

  it("does not generate when another opener wins the claim", async () => {
    mocks.claimTaskGeneration.mockResolvedValue(false);
    const { result } = renderHook(() => useConceptPracticeStart("u1"));
    let id: string | null = "x";
    await act(async () => {
      id = await result.current.ensureGeneratedSet(task());
    });
    expect(id).toBeNull();
    expect(result.current.error).toBe(BEING_PREPARED_MESSAGE);
    expect(mocks.generateConceptQuiz).not.toHaveBeenCalled();
    expect(mocks.releaseTaskGeneration).not.toHaveBeenCalled();
    expect(result.current.generatingTaskId).toBeNull();
  });

  it("on failure returns null, sets an error and releases its own claim", async () => {
    mocks.generateConceptQuiz.mockRejectedValue(new Error("Model timed out."));
    const { result } = renderHook(() => useConceptPracticeStart("u1"));
    let id: string | null = "x";
    await act(async () => {
      id = await result.current.ensureGeneratedSet(task());
    });
    expect(id).toBeNull();
    expect(result.current.error).toBe("Model timed out.");
    expect(mocks.releaseTaskGeneration).toHaveBeenCalledWith("u1", "t1", mocks.claimTaskGeneration.mock.calls[0][2]);
    expect(mocks.saveGeneratedSetId).not.toHaveBeenCalled();
    expect(result.current.generatingTaskId).toBeNull();
  });

  it("generates from the first source with levels and avoid list, saves the id, and clears the busy flag", async () => {
    const { result } = renderHook(() => useConceptPracticeStart("u1"));
    let finish: (setId: string) => void = () => undefined;
    mocks.generateConceptQuiz.mockReturnValue(new Promise<string>((resolve) => { finish = resolve; }));
    let pending: Promise<string | null> = Promise.resolve(null);
    await act(async () => {
      pending = result.current.ensureGeneratedSet(task({ sourceDocKeys: ["doc-1", "doc-2"] }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.generatingTaskId).toBe("t1");
    let id: string | null = null;
    await act(async () => {
      finish("new-set");
      id = await pending;
    });
    expect(id).toBe("new-set");
    const call = mocks.generateConceptQuiz.mock.calls[0][0];
    expect(call.sourceDocKey).toBe("doc-1");
    expect(call.focus.avoid).toEqual(["Old?"]);
    expect(call.focus.quotas[0].level).toBe("challenge");
    expect(mocks.saveGeneratedSetId).toHaveBeenCalledWith("u1", "t1", "new-set");
    expect(result.current.generatingTaskId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("saves the daily set unpinned, marked as plan-generated, avoiding only the newest sets", async () => {
    const { result } = renderHook(() => useConceptPracticeStart("u1"));
    await act(async () => {
      await result.current.ensureGeneratedSet(task());
    });
    expect(mocks.generateConceptQuiz.mock.calls[0][0]).toMatchObject({
      pinned: false,
      generatedForPlan: true,
    });
    expect(mocks.askedQuestionTexts).toHaveBeenCalledWith("u1", "c1", ["doc-1"], {
      maxSets: DAILY_QUIZ_AVOID_SET_LIMIT,
    });
  });

  it("resolves null immediately for a task that is not concept practice", async () => {
    const { result } = renderHook(() => useConceptPracticeStart("u1"));
    let id: string | null = "x";
    await act(async () => {
      id = await result.current.ensureGeneratedSet({
        id: "t2", courseId: "c1", activityType: "quiz", targetId: "q",
      } as unknown as Task);
    });
    expect(id).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mocks.claimTaskGeneration).not.toHaveBeenCalled();
  });
});
