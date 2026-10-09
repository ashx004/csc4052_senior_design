import type { TaskStatus } from "./types";

export const STUDY_BLOCK_MINUTES = 20;
export const STUDY_BREAK_MINUTES = 5;
export const DROP_SNAP_MINUTES = 15;

const MINUTE = 60_000;
const ACTIVE: readonly TaskStatus[] = ["recommended", "in_progress"];

export type ScheduleUpdate = { taskId: string; scheduledStart: string; scheduledEnd: string };
type ScheduleInput = {
  id: string;
  status: TaskStatus;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  scheduleRemoved?: boolean | null;
};
type DueInput = {
  id: string;
  status: TaskStatus;
  scheduledStart?: string | null;
  sourceSuggestionId?: string | null;
  generatedPracticeQuizId?: string | null;
};

export function roundUpToStep(date: Date, stepMinutes: number): Date {
  const stepMs = stepMinutes * MINUTE;
  const clean = new Date(date);
  clean.setSeconds(0, 0);
  const hadRemainder = date.getSeconds() !== 0 || date.getMilliseconds() !== 0;
  const minutes = clean.getMinutes();
  const remainder = minutes % stepMinutes;
  if (remainder === 0 && !hadRemainder) return clean;
  const base = clean.getTime() - remainder * MINUTE;
  return new Date(base + stepMs);
}

export function scheduleUnscheduledTasks(tasks: readonly ScheduleInput[], now: Date): ScheduleUpdate[] {
  const active = tasks.filter((task) => ACTIVE.includes(task.status));
  const lastEnd = active
    .filter((task) => task.scheduledStart && task.scheduledEnd)
    .reduce((latest, task) => Math.max(latest, new Date(task.scheduledEnd as string).getTime()), 0);
  let cursor = Math.max(
    roundUpToStep(now, 5).getTime(),
    lastEnd > 0 ? lastEnd + STUDY_BREAK_MINUTES * MINUTE : 0,
  );
  const updates: ScheduleUpdate[] = [];
  for (const task of active) {
    if (task.scheduledStart || task.scheduleRemoved === true) continue;
    const end = cursor + STUDY_BLOCK_MINUTES * MINUTE;
    updates.push({
      taskId: task.id,
      scheduledStart: new Date(cursor).toISOString(),
      scheduledEnd: new Date(end).toISOString(),
    });
    cursor = end + STUDY_BREAK_MINUTES * MINUTE;
  }
  return updates;
}

export function moveBlock(
  block: { scheduledStart: string; scheduledEnd: string },
  newStart: Date,
): { scheduledStart: string; scheduledEnd: string } {
  const length = new Date(block.scheduledEnd).getTime() - new Date(block.scheduledStart).getTime();
  const duration = Number.isFinite(length) && length > 0 ? length : STUDY_BLOCK_MINUTES * MINUTE;
  return {
    scheduledStart: newStart.toISOString(),
    scheduledEnd: new Date(newStart.getTime() + duration).toISOString(),
  };
}

export function dropStartFromOffset(day: Date, hour: number, offsetY: number, cellHeight: number): Date {
  const rawMinutes = cellHeight > 0 && Number.isFinite(offsetY) ? (offsetY / cellHeight) * 60 : 0;
  const snapped = Math.floor(rawMinutes / DROP_SNAP_MINUTES) * DROP_SNAP_MINUTES;
  const minutes = Math.min(60 - DROP_SNAP_MINUTES, Math.max(0, snapped));
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minutes, 0, 0);
}

/**
 * Like dropStartFromOffset but does not clamp to the cell: events overflow
 * their start-hour cell, so a drop can land past it. Date rolls over hours.
 */
export function dropStartFromPointer(
  day: Date,
  hour: number,
  offsetY: number,
  cellHeight: number,
  grabOffsetY = 0,
): Date {
  const y = offsetY - grabOffsetY;
  const rawMinutes = cellHeight > 0 && Number.isFinite(y) ? (y / cellHeight) * 60 : 0;
  const minutes = Math.floor(rawMinutes / DROP_SNAP_MINUTES) * DROP_SNAP_MINUTES;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minutes, 0, 0);
}

export function weakSpotTasksDue(tasks: readonly DueInput[], now: Date): string[] {
  return tasks
    .filter(
      (task) =>
        Boolean(task.sourceSuggestionId) &&
        task.status === "recommended" &&
        Boolean(task.scheduledStart) &&
        new Date(task.scheduledStart as string).getTime() <= now.getTime() &&
        !task.generatedPracticeQuizId,
    )
    .map((task) => task.id);
}
