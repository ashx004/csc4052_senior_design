import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";
import type { TaskStatus } from "./types";

export type StudyTaskLike = {
  id: string;
  title: string;
  status: TaskStatus;
  courseId: string;
  courseCode: string;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  googleEventId?: string | null;
};

function isShown(task: StudyTaskLike): task is StudyTaskLike & { scheduledStart: string; scheduledEnd: string } {
  return Boolean(task.scheduledStart && task.scheduledEnd) && task.status !== "skipped" && task.status !== "rescheduled";
}

export function studyTaskToCalendarEvent(task: StudyTaskLike): CalendarEvent | null {
  if (!isShown(task)) return null;
  return {
    id: `study-${task.id}`,
    title: task.title,
    startTime: task.scheduledStart,
    endTime: task.scheduledEnd,
    allDay: false,
    source: "study",
    kind: "study",
    tone: "sage",
    taskId: task.id,
    done: task.status === "completed",
    classId: task.courseId,
    className: task.courseCode,
  };
}

export function studyTasksToCalendarEvents(tasks: readonly StudyTaskLike[]): CalendarEvent[] {
  return tasks
    .map(studyTaskToCalendarEvent)
    .filter((event): event is CalendarEvent => event !== null);
}

export function hideSyncedGoogleDuplicates(
  googleEvents: readonly CalendarEvent[],
  tasks: readonly StudyTaskLike[],
): CalendarEvent[] {
  const pushed = new Set(tasks.map((task) => task.googleEventId).filter(Boolean));
  return googleEvents.filter((event) => !pushed.has(event.id));
}

export function googleEventBodyForTask(task: StudyTaskLike, timeZone: string) {
  if (!task.scheduledStart || !task.scheduledEnd) return null;
  return {
    summary: task.status === "completed" ? `Done: ${task.title}` : task.title,
    description: `Study block from Catalyst (${task.courseCode})`,
    start: { dateTime: task.scheduledStart, timeZone },
    end: { dateTime: task.scheduledEnd, timeZone },
  };
}
