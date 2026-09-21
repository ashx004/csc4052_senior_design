import type { StudyTask } from "./types";

export function getVisibleStudyTasks<T extends StudyTask>(tasks: T[]): T[] {
  return tasks.filter((task) => task.status !== "skipped");
}
