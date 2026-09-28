import type { ActivityTarget, StudyTask } from "./types";

export function resolveActivityTarget(
  task: Pick<StudyTask, "activityType" | "targetId" | "activityTarget">
): ActivityTarget | null {
  if (task.activityTarget) return task.activityTarget;
  if (task.activityType === "quiz" && task.targetId) {
    return { kind: "quiz", quizId: task.targetId, sourceDocKey: null, mode: "full" };
  }
  if (task.activityType === "flashcards" && task.targetId) {
    return { kind: "flashcard_set", setId: task.targetId, sourceDocKey: null };
  }
  return null;
}
