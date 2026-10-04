import type { StudyTask, TaskStatus } from "./types";

export function buildCarryoverUpdate(
  task: Pick<StudyTask, "status" | "rescheduleCount">,
  today: string,
): {
  status: "recommended";
  scheduledDate: string;
  planDate: string;
  scheduledStart: null;
  scheduledEnd: null;
  scheduleRemoved: false;
  rescheduleCount: number;
  change: { from: TaskStatus; to: "recommended"; reason: "Carried over" };
} {
  return {
    status: "recommended",
    scheduledDate: today,
    planDate: today,
    scheduledStart: null,
    scheduledEnd: null,
    scheduleRemoved: false,
    rescheduleCount: (task.rescheduleCount ?? 0) + 1,
    change: { from: task.status, to: "recommended", reason: "Carried over" },
  };
}
