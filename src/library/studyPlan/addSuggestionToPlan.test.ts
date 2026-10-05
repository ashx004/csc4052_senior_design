import { describe, expect, it } from "vitest";
import {
  learningSuggestionId,
  learningSuggestionPath,
  studyTaskPath,
  studyTasksCollection,
} from "./firestorePaths";
import type { MissedQuestionsSuggestion, TaskStatus } from "./types";
import {
  afterSuccessfulPlan,
  beginAddWithoutPlan,
  buildTaskFromSuggestion,
  cancelPendingAdd,
  cancelPendingSetup,
  commitSuggestionTask,
  completePendingAdd,
  deferOverageSuggestion,
  findLinkedActiveTask,
  getPlanTimeOverage,
  suggestionAfterLater,
  suggestionTaskDecision,
  type SuggestionTaskWriter,
} from "./addSuggestionToPlan";

const UID = "user-1";

function suggestionWithQuestions(
  count: number,
  overrides: Partial<MissedQuestionsSuggestion & { id: string }> = {},
): MissedQuestionsSuggestion & { id: string } {
  const questionIds = Array.from({ length: count }, (_, index) => `q${index + 1}`);
  const questionFailureCounts: Record<string, number> = {};
  questionIds.forEach((questionId, index) => {
    questionFailureCounts[questionId] = count - index;
  });
  return {
    id: "suggestion-1",
    type: "missed_questions",
    courseId: "course-1",
    sourceDocKey: "doc-key",
    quizId: "quiz-1",
    questionIds,
    questionFailureCounts,
    status: "active",
    priority: count,
    linkedTaskId: null,
    sourceAttemptId: "attempt-1",
    ...overrides,
  };
}

function courseInfo() {
  return { name: "Algorithms", code: "CSC4052" };
}

function suggestion(id: string) {
  return { id };
}

function task(
  overrides: {
    id?: string;
    sourceSuggestionId?: string | null;
    status?: TaskStatus;
  } = {},
) {
  return {
    id: "task-1",
    sourceSuggestionId: null as string | null,
    status: "recommended" as TaskStatus,
    ...overrides,
  };
}

class MemoryStore {
  docs = new Map<string, Record<string, unknown>>();
  readonly stamp = { __serverTimestamp: true };
  private nextId = 0;

  seed(path: string, data: Record<string, unknown>) {
    this.docs.set(path, { ...data });
  }

  async runTransaction<T>(fn: (writer: SuggestionTaskWriter) => Promise<T>): Promise<T> {
    const snapshot = new Map(this.docs);
    const writer: SuggestionTaskWriter = {
      get: async (path) => {
        const data = this.docs.get(path);
        return {
          exists: data != null,
          data: () => (data ? { ...data } : undefined),
        };
      },
      set: (path, data) => {
        this.docs.set(path, { ...data });
      },
      update: (path, data) => {
        const existing = this.docs.get(path);
        if (!existing) throw new Error(`Missing document ${path}`);
        this.docs.set(path, { ...existing, ...data });
      },
      createId: () => `task-${++this.nextId}`,
      serverTimestamp: () => this.stamp,
    };
    try {
      return await fn(writer);
    } catch (error) {
      this.docs = snapshot;
      throw error;
    }
  }
}

function suggestionPath(suggestionDoc: MissedQuestionsSuggestion & { id: string }) {
  return learningSuggestionPath(
    UID,
    learningSuggestionId(suggestionDoc.courseId, suggestionDoc.quizId),
  );
}

describe("buildTaskFromSuggestion", () => {
  it("builds a fixed missed-question task capped at ten", () => {
    const taskDraft = buildTaskFromSuggestion(
      suggestionWithQuestions(12),
      courseInfo(),
      "2026-09-27",
    );
    expect(taskDraft.activityTarget).toMatchObject({ kind: "quiz", mode: "missed_questions" });
    expect(
      taskDraft.activityTarget.kind === "quiz" && taskDraft.activityTarget.questionIds,
    ).toHaveLength(10);
    expect(taskDraft.estimatedMinutes).toBe(20);
  });

  it("names the task for missed questions and the course code", () => {
    const taskDraft = buildTaskFromSuggestion(
      suggestionWithQuestions(3),
      courseInfo(),
      "2026-09-27",
    );
    expect(taskDraft.title).toBe("Review missed questions · CSC4052");
    expect(taskDraft.title.toLowerCase()).not.toContain("concept");
    expect(taskDraft.topicLabel.toLowerCase()).not.toContain("concept");
    expect(taskDraft.activityType).toBe("quiz");
    expect(taskDraft.targetId).toBe("quiz-1");
    expect(taskDraft.sourceSuggestionId).toBe("suggestion-1");
    expect(taskDraft.activityTarget).toMatchObject({
      quizId: "quiz-1",
      sourceDocKey: "doc-key",
      questionIds: ["q1", "q2", "q3"],
    });
    expect(taskDraft.estimatedMinutes).toBe(6);
    expect(taskDraft.planDate).toBe("2026-09-27");
    expect(taskDraft.scheduledDate).toBe("2026-09-27");
    expect(taskDraft.status).toBe("recommended");
  });
});

describe("findLinkedActiveTask", () => {
  it("returns the existing task instead of creating a duplicate", () => {
    expect(
      findLinkedActiveTask(suggestion("s1"), [
        task({ sourceSuggestionId: "s1", status: "recommended" }),
      ])?.id,
    ).toBe("task-1");
  });

  it("ignores completed and skipped tasks for the same suggestion", () => {
    expect(
      findLinkedActiveTask(suggestion("s1"), [
        task({ id: "done", sourceSuggestionId: "s1", status: "completed" }),
        task({ id: "skipped", sourceSuggestionId: "s1", status: "skipped" }),
      ]),
    ).toBeUndefined();
    expect(
      findLinkedActiveTask(suggestion("s1"), [
        task({ id: "live", sourceSuggestionId: "s1", status: "in_progress" }),
      ])?.id,
    ).toBe("live");
  });
});

describe("getPlanTimeOverage", () => {
  it("counts only recommended and in-progress tasks", () => {
    expect(
      getPlanTimeOverage(
        30,
        [
          { estimatedMinutes: 20, status: "completed" },
          { estimatedMinutes: 20, status: "skipped" },
          { estimatedMinutes: 20, status: "rescheduled" },
          { estimatedMinutes: 20, status: "recommended" },
          { estimatedMinutes: 5, status: "in_progress" },
        ],
        15,
      ),
    ).toBe(10);
  });

  it("returns zero when the addition fits the available time", () => {
    expect(
      getPlanTimeOverage(30, [{ estimatedMinutes: 10, status: "in_progress" }], 10),
    ).toBe(0);
  });
});

describe("pending suggestion setup", () => {
  it("clears the pending suggestion only after setup succeeds", () => {
    const pending = beginAddWithoutPlan(null, "s1");
    expect(pending).toBe("s1");
    expect(completePendingAdd(pending, true)).toBeNull();
  });

  it("clears the pending suggestion on cancel and keeps it when setup fails", () => {
    const pending = beginAddWithoutPlan(null, "s1");
    expect(cancelPendingAdd(pending)).toBeNull();
    expect(cancelPendingSetup(pending)).toEqual({
      pendingSuggestionId: null,
      suggestionStatus: "active",
    });
    expect(completePendingAdd(pending, false)).toBe("s1");
    expect(cancelPendingAdd(null)).toBeNull();
  });

  it("leaves an added suggestion added and an active suggestion active", () => {
    expect(suggestionAfterLater({ status: "added", linkedTaskId: "task-1" })).toEqual({
      status: "added",
      linkedTaskId: "task-1",
    });
    expect(suggestionAfterLater({ status: "active", linkedTaskId: null })).toEqual({
      status: "active",
      linkedTaskId: null,
    });
    const deferred = deferOverageSuggestion("s1", "s1", {
      status: "added",
      linkedTaskId: "task-1",
    });
    expect(deferred.suggestionStatus).toBe("added");
    expect(deferred.pendingSuggestionId).toBeNull();
  });

  it("waits on overage after the plan exists and does not create the task yet", () => {
    const pending = beginAddWithoutPlan(null, "s1");
    const waiting = afterSuccessfulPlan(pending, 15);
    expect(waiting).toEqual({
      pendingSuggestionId: "s1",
      showOverage: true,
      createTask: false,
    });
    expect(completePendingAdd(waiting.pendingSuggestionId, false)).toBe("s1");
  });

  it("creates the suggestion task only after the new plan has room", () => {
    const pending = beginAddWithoutPlan(null, "s1");
    const ready = afterSuccessfulPlan(pending, 0);
    expect(ready).toEqual({
      pendingSuggestionId: "s1",
      showOverage: false,
      createTask: true,
    });
    expect(completePendingAdd(ready.pendingSuggestionId, true)).toBeNull();
    expect(afterSuccessfulPlan(null, 20)).toEqual({
      pendingSuggestionId: null,
      showOverage: false,
      createTask: false,
    });
  });

  it("records Later without dropping the suggestion", () => {
    const waiting = afterSuccessfulPlan(beginAddWithoutPlan(null, "s1"), 8);
    const deferred = deferOverageSuggestion(waiting.pendingSuggestionId, "s1");
    expect(deferred).toEqual({
      pendingSuggestionId: null,
      deferredSuggestionId: "s1",
      suggestionStatus: "active",
    });
    expect(deferOverageSuggestion("s1", "s2").pendingSuggestionId).toBe("s1");
  });
});

describe("suggestion task dedupe", () => {
  it("reuses a linked task only while it is still open", () => {
    expect(
      suggestionTaskDecision(
        { linkedTaskId: "task-9" },
        { exists: true, status: "recommended" },
      ),
    ).toEqual({ kind: "reuse", taskId: "task-9" });
    expect(
      suggestionTaskDecision(
        { linkedTaskId: "task-9" },
        { exists: true, status: "in_progress" },
      ),
    ).toEqual({ kind: "reuse", taskId: "task-9" });
    expect(suggestionTaskDecision({ linkedTaskId: null }, null)).toEqual({ kind: "create" });
    expect(
      suggestionTaskDecision({ linkedTaskId: "task-9" }, { exists: false }),
    ).toEqual({ kind: "create" });
    expect(
      suggestionTaskDecision(
        { linkedTaskId: "task-9" },
        { exists: true, status: "completed" },
      ),
    ).toEqual({ kind: "create" });
    expect(
      suggestionTaskDecision(
        { linkedTaskId: "task-9" },
        { exists: true, status: "skipped" },
      ),
    ).toEqual({ kind: "create" });
  });

  it("creates one task and reuses it when the suggestion is submitted twice", async () => {
    const store = new MemoryStore();
    const suggestionDoc = suggestionWithQuestions(4);
    const path = suggestionPath(suggestionDoc);
    store.seed(path, { ...suggestionDoc });
    const input = {
      uid: UID,
      suggestion: suggestionDoc,
      planDate: "2026-09-27",
      course: courseInfo(),
      existingTaskId: null,
    };

    const first = await store.runTransaction((writer) => commitSuggestionTask(writer, input));
    const second = await store.runTransaction((writer) => commitSuggestionTask(writer, input));

    expect(first).toBe("task-1");
    expect(second).toBe(first);
    const taskPaths = [...store.docs.keys()].filter((key) =>
      key.startsWith(`${studyTasksCollection(UID)}/`),
    );
    expect(taskPaths).toEqual([studyTaskPath(UID, "task-1")]);
    expect(store.docs.get(path)).toMatchObject({
      status: "added",
      linkedTaskId: "task-1",
    });
    expect(store.docs.get(studyTaskPath(UID, "task-1"))).toMatchObject({
      activityType: "quiz",
      targetId: "quiz-1",
      sourceSuggestionId: suggestionDoc.id,
      estimatedMinutes: 8,
      title: "Review missed questions · CSC4052",
      status: "recommended",
      activityTarget: {
        kind: "quiz",
        mode: "missed_questions",
        quizId: "quiz-1",
      },
    });
    expect(
      (store.docs.get(studyTaskPath(UID, "task-1"))?.activityTarget as { questionIds: string[] })
        .questionIds,
    ).toHaveLength(4);
  });

  it("links an already active task without creating another", async () => {
    const store = new MemoryStore();
    const suggestionDoc = suggestionWithQuestions(2);
    const path = suggestionPath(suggestionDoc);
    store.seed(path, { ...suggestionDoc, linkedTaskId: null });

    const taskId = await store.runTransaction((writer) =>
      commitSuggestionTask(writer, {
        uid: UID,
        suggestion: suggestionDoc,
        planDate: "2026-09-27",
        course: courseInfo(),
        existingTaskId: "already-live",
      }),
    );

    expect(taskId).toBe("already-live");
    expect([...store.docs.keys()].some((key) => key.includes("/studyTasks/"))).toBe(false);
    expect(store.docs.get(path)).toMatchObject({
      status: "added",
      linkedTaskId: "already-live",
    });
  });

  it("replaces a missing, completed, or skipped linked task", async () => {
    const cases = [
      { label: "missing", status: null },
      { label: "completed", status: "completed" as const },
      { label: "skipped", status: "skipped" as const },
    ];

    for (const entry of cases) {
      const store = new MemoryStore();
      const suggestionDoc = suggestionWithQuestions(2, { linkedTaskId: "task-old" });
      const path = suggestionPath(suggestionDoc);
      store.seed(path, { ...suggestionDoc });
      if (entry.status) {
        store.seed(studyTaskPath(UID, "task-old"), { status: entry.status });
      }

      const taskId = await store.runTransaction((writer) =>
        commitSuggestionTask(writer, {
          uid: UID,
          suggestion: suggestionDoc,
          planDate: "2026-09-27",
          course: courseInfo(),
          existingTaskId: "task-old",
        }),
      );

      expect(taskId, entry.label).toBe("task-1");
      expect(taskId).not.toBe("task-old");
      expect(store.docs.get(path)).toMatchObject({
        status: "added",
        linkedTaskId: "task-1",
      });
      if (entry.status) {
        expect(store.docs.get(studyTaskPath(UID, "task-old"))).toMatchObject({
          status: entry.status,
        });
      }
    }
  });
});
