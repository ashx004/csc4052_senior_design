import { useMemo, useState } from "react";
import EventPill from "@/src/components/calendar/EventPill";
import TimedEvent from "@/src/components/calendar/TimedEvent";
import {
  buildTimeSlots,
  getTimedEventsForDay,
  getAllDayEvents,
  getEventPosition,
} from "@/src/library/calendarHelpers";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";
import { dropStartFromPointer } from "@/src/library/studyPlan/studySchedule";

// Class schedules can run outside the traditional daytime window. Month view
// showed them because it has no hour cutoff; daily view must use the same
// complete calendar day.
const START_HOUR = 0;
const END_HOUR = 24;

const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type DayViewProps = {
  events: CalendarEvent[];
  selectedDate: Date;
  onEventClick?: (event: CalendarEvent) => void;
  onStudyBlockMove?: (event: CalendarEvent, newStart: Date) => void;
};

export default function DayView({ events, selectedDate, onEventClick, onStudyBlockMove }: DayViewProps) {
  const [dragged, setDragged] = useState<CalendarEvent | null>(null);
  const [grabOffsetY, setGrabOffsetY] = useState(0);
  const timeSlots = useMemo(() => buildTimeSlots(START_HOUR, END_HOUR), []);
  const timedEvents = useMemo(
    () => getTimedEventsForDay(events, selectedDate),
    [events, selectedDate]
  );
  const allDayEvents = useMemo(
    () => getAllDayEvents(events, selectedDate),
    [events, selectedDate]
  );

  const dayName = DAY_NAMES[selectedDate.getDay()];
  const monthName = MONTH_NAMES[selectedDate.getMonth()];
  const dayNum = selectedDate.getDate();
  const isToday =
    selectedDate.toDateString() === new Date().toDateString();

  return (
    <div className="overflow-hidden rounded-2xl border border-border-light bg-bg-container">
      {/* ── Header ── */}
      <div className="border-b border-border-light bg-bg-warm px-6 py-5">
        <p className="text-sm font-medium text-text-muted">
          {dayName}, {monthName} {selectedDate.getFullYear()}
        </p>
        <h3
          className={`mt-1 text-3xl font-semibold ${
            isToday ? "text-primary" : "text-text-main"
          }`}
        >
          {dayNum}
        </h3>
      </div>

      {/* ── All-day row ── */}
      <div className="grid grid-cols-[95px_1fr] border-b border-border-light">
        <div className="flex items-center justify-end border-r border-border-light bg-bg-container px-4 py-4 text-xs text-text-muted">
          All day
        </div>
        <div className="space-y-2 p-4">
          {allDayEvents.length > 0 ? (
            allDayEvents.map((ev, i) => (
              <EventPill key={`${ev.id}-${i}`} event={ev} onClick={onEventClick} />
            ))
          ) : (
            <p className="text-xs text-text-muted italic">No all-day events</p>
          )}
        </div>
      </div>

      {/* ── Time grid ── */}
      <div className="max-h-[620px] overflow-y-auto">
        {timeSlots.map((time, hourIndex) => {
          const hour = START_HOUR + hourIndex;

          // Events that start in this hour slot
          const hourEvents = timedEvents.filter((ev) => {
            const start = new Date(ev.startTime);
            return start.getHours() === hour;
          });

          return (
            <div key={`day-${time}`} className="grid grid-cols-[95px_1fr]">
              <div className="h-16 border-r border-b border-border-light bg-bg-container px-4 pt-2 text-right text-xs text-text-muted">
                {time}
              </div>

              <div
                className="relative h-16 border-b border-border-light p-2"
                onDragOver={(e) => { if (dragged) e.preventDefault(); }}
                onDrop={(e) => {
                  if (!dragged) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const start = dropStartFromPointer(selectedDate, hour, e.clientY - rect.top, rect.height, grabOffsetY);
                  if (start.toDateString() === selectedDate.toDateString() && new Date(dragged.startTime).toDateString() === selectedDate.toDateString()) {
                    onStudyBlockMove?.(dragged, start);
                  }
                  setDragged(null);
                }}
              >
                {hourEvents.map((ev) => {
                  const { topPx, heightPx } = getEventPosition(ev, hour);
                  const movable = ev.source === "study" && !ev.done && Boolean(onStudyBlockMove);
                  return (
                    <TimedEvent
                      key={ev.id}
                      title={`${new Date(ev.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}–${new Date(ev.endTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} ${ev.title}`}
                      tone={ev.tone ?? "cream"}
                      color={ev.color}
                      height={`h-[${heightPx}px]`}
                      style={{ top: `${topPx}px` }}
                      onClick={() => onEventClick?.(ev)}
                      hasConflict={Boolean(ev.conflictTitles?.length)}
                      done={ev.source === "study" ? ev.done : undefined}
                      draggable={movable}
                      onDragStart={movable ? (e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", ev.id); setGrabOffsetY(e.clientY - e.currentTarget.getBoundingClientRect().top); setDragged(ev); } : undefined}
                      onDragEnd={movable ? () => setDragged(null) : undefined}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
