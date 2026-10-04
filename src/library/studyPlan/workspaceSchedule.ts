import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";
import type { TaskStatus } from "./types";

export type WorkspaceScheduleTask = {
  id: string;
  title: string;
  status: TaskStatus;
  courseCode?: string;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  scheduleRemoved?: boolean | null;
  googleEventId?: string | null;
};

export type WorkspaceScheduleItem = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  kind: "task" | "event";
  courseCode?: string;
  taskId?: string;
  status?: TaskStatus;
};

function isOnDay(value: string, day: Date): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) &&
    date.getFullYear() === day.getFullYear() &&
    date.getMonth() === day.getMonth() &&
    date.getDate() === day.getDate();
}

function hasValidEnd(start: string, end: string): boolean {
  return new Date(end).getTime() > new Date(start).getTime();
}

export function buildTodayScheduleItems(
  tasks: readonly WorkspaceScheduleTask[],
  calendarEvents: readonly CalendarEvent[],
  day: Date,
): WorkspaceScheduleItem[] {
  const pushedIds = new Set(tasks.map((task) => task.googleEventId).filter(Boolean));
  const items: WorkspaceScheduleItem[] = [];

  for (const task of tasks) {
    if (task.scheduleRemoved || task.status === "skipped" || task.status === "rescheduled") continue;
    if (!task.scheduledStart || !task.scheduledEnd || !isOnDay(task.scheduledStart, day)) continue;
    if (!hasValidEnd(task.scheduledStart, task.scheduledEnd)) continue;
    items.push({
      id: task.id,
      title: task.title,
      startTime: task.scheduledStart,
      endTime: task.scheduledEnd,
      kind: "task",
      courseCode: task.courseCode,
      taskId: task.id,
      status: task.status,
    });
  }

  for (const event of calendarEvents) {
    if (event.allDay || event.source === "study" || event.status === "cancelled" || pushedIds.has(event.id)) continue;
    if (!isOnDay(event.startTime, day) || !hasValidEnd(event.startTime, event.endTime)) continue;
    items.push({
      id: event.id,
      title: event.title,
      startTime: event.startTime,
      endTime: event.endTime,
      kind: "event",
      courseCode: event.className,
    });
  }

  return items.sort((a, b) =>
    new Date(a.startTime).getTime() - new Date(b.startTime).getTime() ||
    (a.kind === "task" ? -1 : 1) - (b.kind === "task" ? -1 : 1)
  );
}
