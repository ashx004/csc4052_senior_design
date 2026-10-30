import { conceptKey } from "./conceptKey";
import { selectPracticeQuestionIds } from "./learningSuggestionEngine";
import {
  learningSuggestionId,
  learningSuggestionPath,
  studyTaskPath,
} from "./firestorePaths";
import type { ConceptQuota } from "@/src/library/generation/allocateConceptQuotas";
import type {
  ActivityTarget,
  ConceptWeakSpot,
  LearningSuggestionStatus,
  MissedQuestionsSuggestion,
  StudyTask,
  TaskStatus,
} from "./types";

export interface SuggestionCourseInfo {
  name: string;
  code: string;
}

export type SuggestionTaskDraft = Omit<StudyTask, "createdAt" | "updatedAt"> & {
  activityTarget: Extract<ActivityTarget, { kind: "quiz" | "concept_practice" }>;
  /** null for tasks that are not backed by a learning suggestion document. */
  sourceSuggestionId: string | null;
};

export interface SuggestionTaskDocument {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface SuggestionTaskWriter {
  get(path: string): Promise<SuggestionTaskDocument>;
  set(path: string, data: Record<string, unknown>): void;
  update(path: string, data: Record<string, unknown>): void;
  createId(): string;
  serverTimestamp(): unknown;
}

export interface CommitSuggestionTaskInput {
  uid: string;
  suggestion: MissedQuestionsSuggestion & { id: string };
  planDate: string;
  course: SuggestionCourseInfo;
  existingTaskId: string | null;
  /** Pre-built task to write instead of the default missed-questions draft. */
  draft?: SuggestionTaskDraft;
}

const ACTIVE_TASK_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "recommended",
  "in_progress",
]);

export function buildTaskFromSuggestion(
  suggestion: MissedQuestionsSuggestion & { id: string },
  course: SuggestionCourseInfo,
  planDate: string,
): SuggestionTaskDraft {
  const questionIds = selectPracticeQuestionIds(suggestion, 10);
  return {
    planDate,
    courseId: suggestion.courseId,
    courseName: course.name,
    courseCode: course.code,
    title: `Review missed questions · ${course.code}`,
    activityType: "quiz",
    targetId: suggestion.quizId,
    topicLabel: "Missed questions",
    estimatedMinutes: questionIds.length * 2,
    source: "recommended",
    reason: "Practice the questions you missed.",
    priorityScore: suggestion.priority,
    status: "recommended",
    statusHistory: [],
    scheduledDate: planDate,
    rescheduleCount: 0,
    skipCount: 0,
    activeSessionId: null,
    totalActiveMinutes: 0,
    completedAt: null,
    activityTarget: {
      kind: "quiz",
      quizId: suggestion.quizId,
      sourceDocKey: suggestion.sourceDocKey,
      mode: "missed_questions",
      questionIds,
    },
    sourceSuggestionId: suggestion.id,
  };
}

export interface BuildConceptPracticeTaskInput {
  courseId: string;
  course: SuggestionCourseInfo;
  planDate: string;
  quotas: ConceptQuota[];
  sourceDocKeys: string[];
  practiceType: Extract<ActivityTarget, { kind: "concept_practice" }>["practiceType"];
}

/** A queued practice task. The set is generated when the task starts, so no set exists yet. */
export function buildConceptPracticeTask(
  input: BuildConceptPracticeTaskInput,
): SuggestionTaskDraft {
  const labels = input.quotas.map((quota) => quota.label);
  const questionCount = input.quotas.reduce((sum, quota) => sum + quota.items, 0);
  return {
    planDate: input.planDate,
    courseId: input.courseId,
    courseName: input.course.name,
    courseCode: input.course.code,
    title: `Practice: ${labels.join(", ")}`,
    activityType: input.practiceType === "flashcards" ? "flashcards" : "quiz",
    targetId: null,
    topicLabel: labels.join(", "),
    estimatedMinutes: questionCount * 2,
    source: "recommended",
    reason: "Practice the concepts you are still missing.",
    priorityScore: null,
    status: "recommended",
    statusHistory: [],
    scheduledDate: input.planDate,
    rescheduleCount: 0,
    skipCount: 0,
    activeSessionId: null,
    totalActiveMinutes: 0,
    completedAt: null,
    activityTarget: {
      kind: "concept_practice",
      conceptKeys: input.quotas.map((quota) => quota.conceptKey),
      conceptLabels: labels,
      sourceDocKeys: input.sourceDocKeys,
      practiceType: input.practiceType,
      questionCount,
      // A quota that carries the level its concept earned passes it to the generated set.
      // Keys are normalized so the generator's lookup by normalized key finds them.
      conceptLevels: Object.fromEntries(
        input.quotas.flatMap((quota) =>
          quota.level ? [[conceptKey(quota.conceptKey), quota.level] as const] : [],
        ),
      ),
      generatedSetId: null,
      generationClaimedAtMs: null,
    },
    sourceSuggestionId: null,
  };
}

/** One missed_questions quiz draft per quiz the weak spot was missed in. No multi-quiz target exists. */
export function buildRetryWrongAnswersTasks(
  weakSpot: ConceptWeakSpot,
  course: SuggestionCourseInfo,
  planDate: string,
  maxQuestionsPerQuiz = 10,
): SuggestionTaskDraft[] {
  const byQuiz = new Map<string, Map<string, number>>();
  for (const miss of weakSpot.misses) {
    const questions = byQuiz.get(miss.quizId) ?? new Map<string, number>();
    questions.set(
      miss.questionId,
      Math.max(questions.get(miss.questionId) ?? 0, miss.failureCount),
    );
    byQuiz.set(miss.quizId, questions);
  }
  return [...byQuiz].map(([quizId, questions]) => {
    const questionIds = [...questions]
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxQuestionsPerQuiz)
      .map(([questionId]) => questionId);
    return {
      planDate,
      courseId: weakSpot.courseId,
      courseName: course.name,
      courseCode: course.code,
      title: `Retry wrong answers: ${weakSpot.label}`,
      activityType: "quiz",
      targetId: quizId,
      topicLabel: weakSpot.label,
      estimatedMinutes: questionIds.length * 2,
      source: "recommended",
      reason: "Retry the questions you got wrong.",
      priorityScore: null,
      status: "recommended",
      statusHistory: [],
      scheduledDate: planDate,
      rescheduleCount: 0,
      skipCount: 0,
      activeSessionId: null,
      totalActiveMinutes: 0,
      completedAt: null,
      activityTarget: {
        kind: "quiz",
        quizId,
        sourceDocKey: weakSpot.sourceDocKeys[0] ?? null,
        mode: "missed_questions",
        questionIds,
      },
      sourceSuggestionId: learningSuggestionId(weakSpot.courseId, quizId),
    } satisfies SuggestionTaskDraft;
  });
}

export function findLinkedActiveTask<
  T extends {
    id: string;
    sourceSuggestionId?: string | null;
    status: TaskStatus;
  },
>(suggestion: { id: string }, tasks: readonly T[]): T | undefined {
  return tasks.find(
    (task) =>
      task.sourceSuggestionId === suggestion.id &&
      ACTIVE_TASK_STATUSES.has(task.status),
  );
}

export function getPlanTimeOverage(
  availableMinutes: number,
  tasks: Array<{ estimatedMinutes: number; status: TaskStatus }>,
  addedMinutes: number,
): number {
  const planned = tasks
    .filter((task) => task.status === "recommended" || task.status === "in_progress")
    .reduce((sum, task) => sum + task.estimatedMinutes, 0);
  return Math.max(0, planned + addedMinutes - availableMinutes);
}

export function beginAddWithoutPlan(
  _pendingSuggestionId: string | null,
  suggestionId: string,
): string {
  return suggestionId;
}

export function completePendingAdd(
  pendingSuggestionId: string | null,
  succeeded: boolean,
): string | null {
  if (succeeded) return null;
  return pendingSuggestionId;
}

export function cancelPendingAdd(_pendingSuggestionId: string | null): string | null {
  return null;
}

/** Cancel drops the setup intent only. The suggestion document stays active. */
export function cancelPendingSetup(_pendingSuggestionId: string | null): {
  pendingSuggestionId: null;
  suggestionStatus: "active";
} {
  return { pendingSuggestionId: null, suggestionStatus: "active" };
}

export function suggestionAfterLater(suggestion: {
  status: string;
  linkedTaskId: string | null;
}): { status: "active" | "added"; linkedTaskId: string | null } {
  if (suggestion.status === "added") {
    return { status: "added", linkedTaskId: suggestion.linkedTaskId };
  }
  return { status: "active", linkedTaskId: suggestion.linkedTaskId };
}

export interface PlanSuggestionFollowUp {
  pendingSuggestionId: string | null;
  showOverage: boolean;
  createTask: boolean;
}

/** Plan exists. Keep the suggestion pending until it is added or the overage choice is made. */
export function afterSuccessfulPlan(
  pendingSuggestionId: string | null,
  overageMinutes: number,
): PlanSuggestionFollowUp {
  if (!pendingSuggestionId) {
    return { pendingSuggestionId: null, showOverage: false, createTask: false };
  }
  if (overageMinutes > 0) {
    return { pendingSuggestionId, showOverage: true, createTask: false };
  }
  return { pendingSuggestionId, showOverage: false, createTask: true };
}

export interface DeferredOverage {
  pendingSuggestionId: string | null;
  deferredSuggestionId: string;
  suggestionStatus: "active" | "added";
}

/** Record Later. Clear a matching pending id and do not create a task. */
export function deferOverageSuggestion(
  pendingSuggestionId: string | null,
  suggestionId: string,
  suggestion?: { status: string; linkedTaskId: string | null },
): DeferredOverage {
  const kept = suggestionAfterLater(
    suggestion ?? { status: "active", linkedTaskId: null },
  );
  return {
    pendingSuggestionId:
      pendingSuggestionId === suggestionId ? null : pendingSuggestionId,
    deferredSuggestionId: suggestionId,
    suggestionStatus: kept.status,
  };
}

function isReusableTaskStatus(status: TaskStatus | undefined): boolean {
  return status === "recommended" || status === "in_progress";
}

export function suggestionTaskDecision(
  suggestion: { linkedTaskId: string | null },
  linkedTask: { exists: boolean; status?: TaskStatus } | null,
): { kind: "reuse"; taskId: string } | { kind: "create" } {
  if (
    suggestion.linkedTaskId &&
    linkedTask?.exists &&
    isReusableTaskStatus(linkedTask.status)
  ) {
    return { kind: "reuse", taskId: suggestion.linkedTaskId };
  }
  return { kind: "create" };
}

function readTaskStatus(value: unknown): TaskStatus | undefined {
  if (
    value === "recommended" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "skipped" ||
    value === "rescheduled"
  ) {
    return value;
  }
  return undefined;
}

function linkedTaskIdFrom(data: Record<string, unknown> | undefined): string | null {
  return typeof data?.linkedTaskId === "string" && data.linkedTaskId
    ? data.linkedTaskId
    : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
  return value;
}

function failureCounts(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const counts: Record<string, number> = {};
  for (const [questionId, count] of Object.entries(value)) {
    if (typeof count !== "number") return null;
    counts[questionId] = count;
  }
  return counts;
}

function isSuggestionStatus(value: unknown): value is LearningSuggestionStatus {
  return (
    value === "active" ||
    value === "added" ||
    value === "dismissed" ||
    value === "resolved" ||
    value === "unavailable"
  );
}

function suggestionForTask(
  suggestionId: string,
  data: Record<string, unknown> | undefined,
  fallback: MissedQuestionsSuggestion & { id: string },
): MissedQuestionsSuggestion & { id: string } {
  return {
    ...fallback,
    id: suggestionId,
    type: "missed_questions",
    courseId: typeof data?.courseId === "string" ? data.courseId : fallback.courseId,
    sourceDocKey:
      data && "sourceDocKey" in data
        ? typeof data.sourceDocKey === "string"
          ? data.sourceDocKey
          : null
        : fallback.sourceDocKey,
    quizId: typeof data?.quizId === "string" ? data.quizId : fallback.quizId,
    questionIds: stringArray(data?.questionIds) ?? fallback.questionIds,
    questionFailureCounts:
      failureCounts(data?.questionFailureCounts) ?? fallback.questionFailureCounts,
    status: isSuggestionStatus(data?.status) ? data.status : fallback.status,
    priority: typeof data?.priority === "number" ? data.priority : fallback.priority,
    linkedTaskId: linkedTaskIdFrom(data),
    sourceAttemptId:
      typeof data?.sourceAttemptId === "string"
        ? data.sourceAttemptId
        : fallback.sourceAttemptId,
  };
}

export async function commitSuggestionTask(
  writer: SuggestionTaskWriter,
  input: CommitSuggestionTaskInput,
): Promise<string | null> {
  const path = learningSuggestionPath(
    input.uid,
    learningSuggestionId(input.suggestion.courseId, input.suggestion.quizId),
  );
  if (input.suggestion.status === "unavailable") return null;

  const snap = await writer.get(path);
  if (!snap.exists) {
    // Suggestion documents are no longer written. A caller-supplied draft is
    // still saved as a study task; no suggestion document is created.
    if (!input.draft) return null;
    if (input.existingTaskId) return input.existingTaskId;
    const taskId = writer.createId();
    writer.set(studyTaskPath(input.uid, taskId), {
      ...input.draft,
      createdAt: writer.serverTimestamp(),
      updatedAt: writer.serverTimestamp(),
    });
    return taskId;
  }

  const data = snap.data();
  if (data?.status === "unavailable") return null;
  const linkedTaskId = linkedTaskIdFrom(data);
  let linkedTask: { exists: boolean; status?: TaskStatus } | null = null;
  if (linkedTaskId) {
    const taskSnap = await writer.get(studyTaskPath(input.uid, linkedTaskId));
    linkedTask = {
      exists: taskSnap.exists,
      status: readTaskStatus(taskSnap.data()?.status),
    };
  }
  const decision = suggestionTaskDecision({ linkedTaskId }, linkedTask);
  if (decision.kind === "reuse") return decision.taskId;

  if (input.existingTaskId && input.existingTaskId !== linkedTaskId) {
    writer.update(path, {
      status: "added",
      linkedTaskId: input.existingTaskId,
      updatedAt: writer.serverTimestamp(),
    });
    return input.existingTaskId;
  }

  const taskId = writer.createId();
  const draft =
    input.draft ??
    buildTaskFromSuggestion(
      suggestionForTask(input.suggestion.id, data, input.suggestion),
      input.course,
      input.planDate,
    );
  writer.set(studyTaskPath(input.uid, taskId), {
    ...draft,
    createdAt: writer.serverTimestamp(),
    updatedAt: writer.serverTimestamp(),
  });
  writer.update(path, {
    status: "added",
    linkedTaskId: taskId,
    updatedAt: writer.serverTimestamp(),
  });
  return taskId;
}
