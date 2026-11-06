import { resolveActivityTarget } from "./activityTarget";
import {
  findResourceForSourceDocKey,
  isBlankSourceDocKey,
  type RecommendationResource,
} from "./recommendationEngine";
import type { StudyTask } from "./types";

export type TaskLiveness = "openable" | "stale" | "regenerate" | "unknown";

/** What a course still contains. `null` means the read failed, which proves nothing. */
export type CourseContents = {
  resources: readonly RecommendationResource[];
  quizSetIds: ReadonlySet<string>;
  flashcardSetIds: ReadonlySet<string>;
} | null;

export type TaskLivenessInput = Pick<
  StudyTask,
  "activityType" | "targetId" | "activityTarget" | "status"
>;

/**
 * Can this task still be opened? "stale" is returned only from a successful read that
 * found nothing; a failed read is "unknown". Only recommended and in_progress tasks can
 * be stale: finished and skipped tasks are history and are never rewritten.
 */
export function classifyTask(task: TaskLivenessInput, contents: CourseContents): TaskLiveness {
  if (task.status !== "recommended" && task.status !== "in_progress") return "openable";
  if (!contents) return "unknown";

  const target = resolveActivityTarget(task);
  if (!target) {
    if (task.activityType === "reading" && task.targetId) {
      // A blank id names nothing, so no resource can match it and absence proves nothing.
      if (isBlankSourceDocKey(task.targetId)) return "unknown";
      return contents.resources.some((r) => r.id === task.targetId) ? "openable" : "stale";
    }
    return "openable";
  }

  switch (target.kind) {
    case "document":
      // A resource whose OCR has not finished is stored with no source key, no storage key
      // and `url: ""`, so its document target carries a blank sourceDocKey. No lookup can
      // match a blank key, so "not found" here is not evidence the document went away.
      if (isBlankSourceDocKey(target.sourceDocKey)) return "unknown";
      return findResourceForSourceDocKey(target.sourceDocKey, contents.resources)
        ? "openable"
        : "stale";
    case "quiz":
      return contents.quizSetIds.has(target.quizId) ? "openable" : "stale";
    case "flashcard_set":
      return contents.flashcardSetIds.has(target.setId) ? "openable" : "stale";
    case "concept_practice": {
      const setId = target.generatedSetId;
      // Only quiz and flashcard sets are in the snapshot; any other kind cannot be
      // proven gone, so an existing reference to one is left alone.
      const knownSets =
        target.practiceType === "quiz"
          ? contents.quizSetIds
          : target.practiceType === "flashcards"
            ? contents.flashcardSetIds
            : null;
      if (setId && (!knownSets || knownSets.has(setId))) return "openable";

      const hasLiveDocument = target.sourceDocKeys.some((key) =>
        findResourceForSourceDocKey(key, contents.resources)
      );
      if (!hasLiveDocument) return "stale";
      return setId ? "regenerate" : "openable";
    }
  }
}

export function partitionPlanTasks<T extends TaskLivenessInput & { id: string; courseId: string }>(
  tasks: readonly T[],
  contentsByCourse: ReadonlyMap<string, CourseContents>
): { staleIds: string[]; regenerateIds: string[] } {
  const staleIds: string[] = [];
  const regenerateIds: string[] = [];
  for (const task of tasks) {
    const verdict = classifyTask(task, contentsByCourse.get(task.courseId) ?? null);
    if (verdict === "stale") staleIds.push(task.id);
    else if (verdict === "regenerate") regenerateIds.push(task.id);
  }
  return { staleIds, regenerateIds };
}
