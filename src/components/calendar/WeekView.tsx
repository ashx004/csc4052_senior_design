import { useMemo, useState } from "react";
import EventPill from "@/src/components/calendar/EventPill";
import TimedEvent from "@/src/components/calendar/TimedEvent";
import {
  buildWeekDays,
  buildTimeSlots,
  getWeekStart,
  getWeekDates,
  getTimedEventsForDay,
  getAllDayEvents,
  getEventPosition,
} from "@/src/library/calendarHelpers";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";
import { dropStartFromPointer } from "@/src/library/studyPlan/studySchedule";

// Keep weekly view consistent with monthly view and include every scheduled
// class meeting, including early morning and evening sections.
const START_HOUR = 0;
const END_HOUR = 24;

type WeekViewProps = {
  events: CalendarEvent[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
  onStudyBlockMove?: (event: CalendarEvent, newStart: Date) => void;
};

export default function WeekView({
  events,
  selectedDate,
  onSelectDate,
  onEventClick,
  onStudyBlockMove,
}: WeekViewProps) {
  const [dragged, setDragged] = useState<CalendarEvent | null>(null);
  const [grabOffsetY, setGrabOffsetY] = useState(0);
  const weekStart = useMemo(() => getWeekStart(selectedDate), [selectedDate]);
  const weekDays = useMemo(
    () => buildWeekDays(weekStart, selectedDate),
    [weekStart, selectedDate]
  );
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const timeSlots = useMemo(
    () => buildTimeSlots(START_HOUR, END_HOUR),
    []
  );

  return (
    <div className="overflow-x-auto">
      <div className="overflow-hidden rounded-2xl border border-border-light bg-bg-container">
        {/* ── Day column headers ── */}
        <div className="grid min-w-[900px] grid-cols-[80px_repeat(7,minmax(110px,1fr))] border-b border-border-light">
          <div className="border-r border-border-light bg-bg-container" />

          {weekDays.map((day, i) => (
            <button
              key={day.label}
              type="button"
              onClick={() => onSelectDate(weekDates[i])}
              className={`border-r border-border-light px-4 py-3 text-center last:border-r-0 transition-colors ${
                day.selected ? "bg-bg-warm" : "bg-bg-container hover:bg-bg-warm/50"
              }`}
            >
              <p className="text-xs font-medium text-text-muted">{day.label}</p>
              <p
                className={`mt-1 text-lg font-semibold ${
                  day.selected ? "text-primary" : "text-text-main"
                }`}
              >
                {day.day}
              </p>
            </button>
          ))}
        </div>

        {/* ── Scrollable time grid ── */}
        <div className="max-h-[620px] min-w-[900px] overflow-y-auto">
          {/* ── All-day row ── */}
          <div className="grid grid-cols-[80px_repeat(7,minmax(110px,1fr))] border-b border-border-light">
            <div className="flex items-center justify-end border-r border-border-light bg-bg-container px-3 text-xs text-text-muted">
              All day
            </div>

            {weekDates.map((date, i) => {
              const allDayEvts = getAllDayEvents(events, date);
              return (
                <div
                  key={`allday-${weekDays[i].label}`}
                  className="min-h-[64px] border-r border-border-light p-2 last:border-r-0"
                >
                  <div className="space-y-1">
                    {allDayEvts.map((ev, j) => (
                      <EventPill key={`${ev.id}-${j}`} event={ev} onClick={onEventClick} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Hour rows ── */}
          {timeSlots.map((time, hourIndex) => {
            const hour = START_HOUR + hourIndex;

            return (
              <div
                key={time}
                className="grid grid-cols-[80px_repeat(7,minmax(110px,1fr))]"
              >
                {/* Time label */}
                <div className="h-16 border-r border-b border-border-light bg-bg-container px-3 pt-2 text-right text-xs text-text-muted">
                  {time}
                </div>

                {/* Day cells for this hour */}
                {weekDates.map((date, dayIndex) => {
                  // Only render timed events in the hour slot where they START.
                  const timedEvts = getTimedEventsForDay(events, date).filter((ev) => {
                    const start = new Date(ev.startTime);
                    return start.getHours() === hour;
                  });

                  return (
                    <div
                      key={`${weekDays[dayIndex].label}-${time}`}
                      className="relative h-16 border-r border-b border-border-light last:border-r-0"
                      onDragOver={(e) => { if (dragged) e.preventDefault(); }}
                      onDrop={(e) => {
                        if (!dragged) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const start = dropStartFromPointer(date, hour, e.clientY - rect.top, rect.height, grabOffsetY);
                        if (start.toDateString() === date.toDateString() && new Date(dragged.startTime).toDateString() === date.toDateString()) {
                          onStudyBlockMove?.(dragged, start);
                        }
                        setDragged(null);
                      }}
                    >
                      {timedEvts.map((ev) => {
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
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
