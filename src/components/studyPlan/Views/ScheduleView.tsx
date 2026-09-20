"use client";

import type { StudyTask } from "@/src/library/studyPlan/types";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";
import { Clock } from "lucide-react";

interface ScheduleViewProps {
  tasks: (StudyTask & { id: string })[];
  calendarEvents: CalendarEvent[];
  onStart: (taskId: string) => void;
  onSkip: (taskId: string) => void;
  onReschedule: (taskId: string) => void;
  onComplete: (taskId: string) => void;
  onPause: () => void;
}

interface TimeSlot {
  type: "event" | "task";
  startTime: string;
  title: string;
  subtitle?: string;
  durationMin?: number;
  taskId?: string;
  status?: string;
}

export default function ScheduleView({
  tasks,
  calendarEvents,
  onStart,
}: ScheduleViewProps) {
  const eventSlots: TimeSlot[] = calendarEvents.map((e) => ({
    type: "event",
    startTime: e.startTime,
    title: e.title,
    subtitle: e.location ?? undefined,
  }));

  const taskSlots: TimeSlot[] = tasks
    .filter((t) => t.status !== "skipped" && t.status !== "rescheduled")
    .map((t) => ({
      type: "task",
      startTime: "",
      title: t.title,
      subtitle: `${t.courseCode} · ${t.estimatedMinutes} min`,
      durationMin: t.estimatedMinutes,
      taskId: t.id,
      status: t.status,
    }));

  const allSlots = [
    ...eventSlots.sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    ),
  ];

  let taskIdx = 0;
  const merged: TimeSlot[] = [];
  for (const slot of allSlots) {
    while (taskIdx < taskSlots.length) {
      merged.push(taskSlots[taskIdx]);
      taskIdx++;
    }
    merged.push(slot);
  }
  while (taskIdx < taskSlots.length) {
    merged.push(taskSlots[taskIdx]);
    taskIdx++;
  }

  return (
    <div className="space-y-2">
      {merged.length === 0 && (
        <p className="py-8 text-center text-sm text-text-muted">
          No events or tasks for today.
        </p>
      )}
      {merged.map((slot, i) => (
        <div
          key={i}
          className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm ${
            slot.type === "event"
              ? "bg-bg-main"
              : "border border-dashed border-primary/30 bg-primary/5"
          }`}
        >
          <div className="flex-shrink-0">
            {slot.type === "event" ? (
              <span className="text-xs text-text-muted">
                {slot.startTime
                  ? new Date(slot.startTime).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : ""}
              </span>
            ) : (
              <Clock size={14} className="text-primary" />
            )}
          </div>
          <div className="flex-1">
            <span className="font-medium text-text-main">{slot.title}</span>
            {slot.subtitle && (
              <span className="ml-2 text-xs text-text-muted">
                {slot.subtitle}
              </span>
            )}
          </div>
          {slot.type === "task" && slot.status === "recommended" && (
            <button
              onClick={() => slot.taskId && onStart(slot.taskId)}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-hover"
            >
              Start
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
