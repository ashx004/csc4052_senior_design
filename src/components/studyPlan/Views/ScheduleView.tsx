"use client";

import { useMemo } from "react";
import type { StudyTask } from "@/src/library/studyPlan/types";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";

interface ScheduleViewProps {
  tasks: (StudyTask & { id: string })[];
  calendarEvents: CalendarEvent[];
  onStart: (taskId: string) => void;
  onSkip: (taskId: string) => void;
  onReschedule: (taskId: string) => void;
  onComplete: (taskId: string) => void;
  onPause: () => void;
}

interface ScheduleBlock {
  id: string;
  title: string;
  startHour: number;
  startMinute: number;
  durationMin: number;
  colorClass: string;
  dayIndex: number;
  taskId?: string;
  status?: string;
}

const TASK_COLORS = [
  "bg-accent-peach",
  "bg-accent-lavender",
  "bg-accent-sage",
];

const START_HOUR = 9;

function getDayColumns(): { label: string; date: Date }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayNames = [
    "Sunday", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday",
  ];
  const columns: { label: string; date: Date }[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : dayNames[d.getDay()];
    columns.push({ label, date: d });
  }
  return columns;
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatTime(hour: number, minute: number): string {
  const h = hour % 12 || 12;
  const m = String(minute).padStart(2, "0");
  return `${h}:${m}`;
}

export default function ScheduleView({
  tasks,
  calendarEvents,
  onStart,
}: ScheduleViewProps) {
  const dayColumns = useMemo(() => getDayColumns(), []);

  const blocks = useMemo(() => {
    const result: ScheduleBlock[] = [];
    let colorIdx = 0;

    const dayKeyMap = new Map<string, number>();
    dayColumns.forEach((col, i) => dayKeyMap.set(toDateKey(col.date), i));

    for (const event of calendarEvents) {
      const eventDate = new Date(event.startTime);
      const dayIdx = dayKeyMap.get(toDateKey(eventDate));
      if (dayIdx === undefined) continue;
      const endDate = new Date(event.endTime);
      const durationMin = Math.max(
        15,
        Math.round((endDate.getTime() - eventDate.getTime()) / 60000)
      );
      result.push({
        id: event.id,
        title: event.title,
        startHour: eventDate.getHours(),
        startMinute: eventDate.getMinutes(),
        durationMin,
        colorClass: TASK_COLORS[colorIdx % TASK_COLORS.length],
        dayIndex: dayIdx,
      });
      colorIdx++;
    }

    const nextSlot = new Map<number, number>();
    for (let i = 0; i < 3; i++) nextSlot.set(i, START_HOUR * 60);
    for (const block of result) {
      const endMin = block.startHour * 60 + block.startMinute + block.durationMin;
      const current = nextSlot.get(block.dayIndex) ?? START_HOUR * 60;
      if (endMin > current) nextSlot.set(block.dayIndex, endMin);
    }

    const activeTasks = tasks.filter(
      (t) => t.status !== "skipped" && t.status !== "rescheduled"
    );
    for (const task of activeTasks) {
      let dayIdx = 0;
      if (task.scheduledDate) {
        const mapped = dayKeyMap.get(task.scheduledDate);
        if (mapped !== undefined) dayIdx = mapped;
      }
      const slotMinutes = nextSlot.get(dayIdx) ?? START_HOUR * 60;
      const startHour = Math.floor(slotMinutes / 60);
      const startMinute = slotMinutes % 60;
      result.push({
        id: task.id,
        title: task.title,
        startHour,
        startMinute,
        durationMin: task.estimatedMinutes,
        colorClass: TASK_COLORS[colorIdx % TASK_COLORS.length],
        dayIndex: dayIdx,
        taskId: task.id,
        status: task.status,
      });
      nextSlot.set(dayIdx, slotMinutes + task.estimatedMinutes + 5);
      colorIdx++;
    }

    return result;
  }, [tasks, calendarEvents, dayColumns]);

  const hours = useMemo(() => {
    let minH = START_HOUR;
    let maxH = START_HOUR + 3;
    for (const b of blocks) {
      if (b.startHour < minH) minH = b.startHour;
      const endH = Math.ceil(
        (b.startHour * 60 + b.startMinute + b.durationMin) / 60
      );
      if (endH > maxH) maxH = endH;
    }
    const arr: number[] = [];
    for (let h = minH; h <= maxH; h++) arr.push(h);
    return arr;
  }, [blocks]);

  const ROW_H = 72;
  const totalHeight = hours.length * ROW_H;

  return (
    <section className="rounded-[19px] bg-white p-5">
      <div className="grid grid-cols-[75px_repeat(3,1fr)] gap-x-2">
        {/* Column headers */}
        <div />
        {dayColumns.map((col) => (
          <div
            key={col.label}
            className="pb-3 text-[11px] font-bold text-gray-secondary"
          >
            {col.label}
          </div>
        ))}

        {/* Hour labels column */}
        <div className="relative" style={{ height: totalHeight }}>
          {hours.map((h, i) => (
            <div
              key={h}
              className="absolute left-0 text-xs text-gray-secondary"
              style={{ top: i * ROW_H + 4 }}
            >
              {h % 12 || 12} {h < 12 ? "AM" : "PM"}
            </div>
          ))}
        </div>

        {/* Day columns — each is a relative container for absolute blocks */}
        {[0, 1, 2].map((dayIdx) => (
          <div key={dayIdx} className="relative" style={{ height: totalHeight }}>
            {/* Hour grid lines */}
            {hours.map((_, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 border-t border-gray-light/50"
                style={{ top: i * ROW_H }}
              />
            ))}

            {/* Blocks for this day */}
            {blocks
              .filter((b) => b.dayIndex === dayIdx)
              .map((block) => {
                const offsetMin =
                  (block.startHour - hours[0]) * 60 + block.startMinute;
                const topPx = (offsetMin / 60) * ROW_H;
                const heightPx = Math.max(36, (block.durationMin / 60) * ROW_H);

                const endTotalMin =
                  block.startHour * 60 +
                  block.startMinute +
                  block.durationMin;
                const endH = Math.floor(endTotalMin / 60);
                const endM = endTotalMin % 60;
                const timeLabel = `${formatTime(block.startHour, block.startMinute)}–${formatTime(endH, endM)}`;

                return (
                  <div
                    key={block.id}
                    className={`absolute left-0 right-1 overflow-hidden rounded-[10px] ${block.colorClass} px-3 py-2 text-navy`}
                    style={{ top: topPx, height: heightPx }}
                  >
                    <strong className="block truncate text-xs">
                      {block.title}
                    </strong>
                    <span className="text-[10px] text-navy/70">
                      {timeLabel}
                    </span>
                  </div>
                );
              })}
          </div>
        ))}
      </div>

      {blocks.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-secondary">
          No events or tasks scheduled for this period.
        </p>
      )}
    </section>
  );
}
