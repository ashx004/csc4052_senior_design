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

/**
 * A blank identifier (absent, empty or whitespace) names nothing, so no lookup can match it
 * and a lookup that was never possible is not evidence the target was deleted. Every "stale"
 * verdict below is gated on this: it is the one rule that keeps the classifier from reading
 * "I could not ask the question" as "the answer is no".
 */
const namesNothing = isBlankSourceDocKey;

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
      if (namesNothing(task.targetId)) return "unknown";
      return contents.resources.some((r) => r.id === task.targetId) ? "openable" : "stale";
    }
    return "openable";
  }

  switch (target.kind) {
    case "document":
      // A resource whose OCR has not finished is stored with no source key, no storage key
      // and `url: ""`, so its document target carries a blank sourceDocKey. No lookup can
      // match a blank key, so "not found" here is not evidence the document went away.
      if (namesNothing(target.sourceDocKey)) return "unknown";
      return findResourceForSourceDocKey(target.sourceDocKey, contents.resources)
        ? "openable"
        : "stale";
    case "quiz":
      // No producer writes a blank quizId today — it is always a Firestore document id — but
      // the membership test cannot tell "blank" from "deleted", so it is gated like the rest.
      if (namesNothing(target.quizId)) return "unknown";
      return contents.quizSetIds.has(target.quizId) ? "openable" : "stale";
    case "flashcard_set":
      if (namesNothing(target.setId)) return "unknown";
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

      // Blank keys are discarded rather than searched for: conceptWeakSpotEngine opens a weak
      // spot with sourceDocKeys: [], and an OCR resource whose url is not backfilled yet
      // contributes a blank key, so a task can name no searchable document while its documents
      // exist. With nothing left to ask about, the verdict is unknown, not stale. A real key
      // that matches nothing is still evidence, so one blank sibling does not stop pruning.
      // Ordering note: a target with no generatedSetId AND nothing but blank keys lands here
      // and returns "unknown" rather than "regenerate". That combination is unreachable today
      // — a set can only be generated once sourceDocKeys[0] is a usable key, since
      // useConceptPracticeStart returns early with NO_SOURCE_MESSAGE otherwise — so the two
      // verdicts never compete in practice. Revisit this ordering if that early return moves.
      const usableKeys = target.sourceDocKeys.filter((key) => !namesNothing(key));
      if (usableKeys.length === 0) return "unknown";

      const hasLiveDocument = usableKeys.some((key) =>
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
