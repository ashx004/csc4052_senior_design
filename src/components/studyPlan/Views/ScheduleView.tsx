"use client";

import { Fragment, useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Play } from "lucide-react";
import type { StudyTask } from "@/src/library/studyPlan/types";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";
import {
  buildTodayScheduleItems,
  type WorkspaceScheduleItem,
} from "@/src/library/studyPlan/workspaceSchedule";

interface ScheduleViewProps {
  tasks: (StudyTask & { id: string })[];
  calendarEvents: CalendarEvent[];
  today: string;
  onStart: (taskId: string) => void;
  onContinue: (taskId: string) => void;
  onShowList: () => void;
  highlightedTaskId?: string | null;
}

function formatHour(hour: number): string {
  return new Date(2026, 0, 1, hour).toLocaleTimeString("en-US", { hour: "numeric" });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function taskAction(item: WorkspaceScheduleItem): "Start" | "Continue" | null {
  if (item.kind !== "task") return null;
  if (item.status === "recommended") return "Start";
  if (item.status === "in_progress") return "Continue";
  return null;
}

export default function ScheduleView({
  tasks,
  calendarEvents,
  today,
  onStart,
  onContinue,
  onShowList,
  highlightedTaskId = null,
}: ScheduleViewProps) {
  const day = useMemo(() => new Date(`${today}T12:00:00`), [today]);
  const items = useMemo(
    () => buildTodayScheduleItems(tasks, calendarEvents, day),
    [tasks, calendarEvents, day],
  );
  const hourGroups = useMemo(() => {
    const groups = new Map<number, WorkspaceScheduleItem[]>();
    for (const item of items) {
      const hour = new Date(item.startTime).getHours();
      const group = groups.get(hour) ?? [];
      group.push(item);
      groups.set(hour, group);
    }
    return [...groups.entries()].sort(([a], [b]) => a - b);
  }, [items]);
  // Short gaps between back-to-back items (the 5-minute study breaks).
  const breakBefore = useMemo(() => {
    const gaps = new Map<string, number>();
    for (let i = 1; i < items.length; i++) {
      const gap = Math.round(
        (new Date(items[i].startTime).getTime() - new Date(items[i - 1].endTime).getTime()) / 60_000,
      );
      if (gap > 0 && gap <= 15) gaps.set(`${items[i].kind}-${items[i].id}`, gap);
    }
    return gaps;
  }, [items]);
  const unscheduledCount = tasks.filter(
    (task) =>
      (task.status === "recommended" || task.status === "in_progress") &&
      (!task.scheduledStart || !task.scheduledEnd),
  ).length;
  const studyCount = items.filter((item) => item.kind === "task").length;

  return (
    <section aria-label="Today's study schedule" className="overflow-hidden rounded-[19px] border border-gray-light bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-light px-5 py-5 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brown-label">Today’s schedule</p>
          <h4 className="mt-1 text-lg font-semibold text-navy">
            {day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </h4>
          <p className="mt-1 text-sm text-gray-secondary">
            {studyCount} study {studyCount === 1 ? "block" : "blocks"} today
          </p>
        </div>
        <Link
          href="/calendar"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-navy transition-colors hover:bg-gray-input focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
        >
          Open full calendar <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>

      {hourGroups.length === 0 ? (
        <div className="px-5 py-12 text-center sm:px-6">
          <p className="text-sm font-medium text-navy">Nothing timed for today yet</p>
          <p className="mt-1 text-sm text-gray-secondary">Scheduled study blocks and calendar events will appear here.</p>
        </div>
      ) : (
        <div className="px-4 py-3 sm:px-6">
          {hourGroups.map(([hour, group]) => (
            <div key={hour} className="grid grid-cols-[54px_minmax(0,1fr)] gap-3 border-b border-gray-light/70 py-3 last:border-b-0 sm:grid-cols-[70px_minmax(0,1fr)] sm:gap-4">
              <div className="pt-2 text-xs font-semibold text-gray-secondary">{formatHour(hour)}</div>
              <div className="space-y-2 border-l border-gray-light pl-3 sm:pl-4">
                {group.map((item) => {
                  const action = taskAction(item);
                  const completed = item.status === "completed";
                  const highlighted = item.taskId === highlightedTaskId;
                  const breakMinutes = breakBefore.get(`${item.kind}-${item.id}`);
                  return (
                    <Fragment key={`${item.kind}-${item.id}`}>
                    {breakMinutes && (
                      <div className="flex items-center gap-2 py-0.5 text-[11px] font-medium text-gray-secondary">
                        <span className="h-px flex-1 border-t border-dashed border-gray-light" aria-hidden="true" />
                        {breakMinutes} min break
                        <span className="h-px flex-1 border-t border-dashed border-gray-light" aria-hidden="true" />
                      </div>
                    )}
                    <div
                      id={item.taskId ? `study-task-${item.taskId}` : undefined}
                      className={`flex min-w-0 flex-wrap items-center gap-3 rounded-xl border px-3.5 py-3 sm:px-4 ${
                        item.kind === "task"
                          ? "border-gray-light bg-white shadow-sm"
                          : "border-transparent bg-gray-input/70"
                      } ${highlighted ? "ring-2 ring-navy" : ""}`}
                    >
                      <span className={`h-9 w-1 shrink-0 rounded-full ${item.kind === "task" ? "bg-brown-label" : "bg-gray-secondary/40"}`} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold leading-snug ${completed ? "text-gray-secondary line-through" : "text-navy"}`}>{item.title}</p>
                        <p className="mt-1 text-xs text-gray-secondary">
                          {formatTime(item.startTime)}–{formatTime(item.endTime)}
                          {item.courseCode ? ` · ${item.courseCode}` : ""}
                          {item.kind === "event" ? " · Calendar event" : ""}
                        </p>
                      </div>
                      {completed && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-secondary">
                          <Check size={14} aria-hidden="true" /> Done
                        </span>
                      )}
                      {action && item.taskId && (
                        <button
                          type="button"
                          onClick={() => action === "Continue" ? onContinue(item.taskId!) : onStart(item.taskId!)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-light bg-white px-3 text-xs font-semibold text-navy transition-colors hover:border-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                        >
                          <Play size={13} fill="currentColor" aria-hidden="true" /> {action}
                        </button>
                      )}
                    </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {unscheduledCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-light bg-gray-input/40 px-5 py-3 text-sm sm:px-6">
          <span className="text-gray-secondary">{unscheduledCount} {unscheduledCount === 1 ? "task has" : "tasks have"} no scheduled time</span>
          <button type="button" onClick={onShowList} className="font-semibold text-navy underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">
            View in List
          </button>
        </div>
      )}
    </section>
  );
}
