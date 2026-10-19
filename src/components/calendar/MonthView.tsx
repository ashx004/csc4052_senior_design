import { useMemo, useState } from "react";
import EventPill from "@/src/components/calendar/EventPill";
import { buildMonthGrid } from "@/src/library/calendarHelpers";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";

const monthWeekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type MonthViewProps = {
  events: CalendarEvent[];
  currentYear: number;
  currentMonth: number; // 0-indexed
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
  onEventMove?: (event: CalendarEvent, targetDate: Date) => void;
};

export default function MonthView({
  events,
  currentYear,
  currentMonth,
  selectedDate,
  onSelectDate,
  onEventClick,
  onEventMove,
}: MonthViewProps) {
  const [draggedEvent, setDraggedEvent] = useState<CalendarEvent | null>(null);
  const grid = useMemo(
    () => buildMonthGrid(currentYear, currentMonth, events),
    [currentYear, currentMonth, events]
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border-light bg-bg-container">
      {/* Day-of-week header */}
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] border-b border-border-light bg-bg-container">
        {monthWeekDays.map((day) => (
          <div
            key={day}
            className="border-r border-border-light py-2 text-center text-xs font-semibold text-text-muted last:border-r-0 sm:py-3"
          >
            <span className="sm:hidden" aria-hidden="true">{day[0]}</span>
            <span className="sr-only sm:not-sr-only">{day}</span>
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))]">
        {grid.map((cell, index) => {
          const isToday =
            !cell.muted &&
            cell.day === new Date().getDate() &&
            currentMonth === new Date().getMonth() &&
            currentYear === new Date().getFullYear();

          const isSelected =
            !cell.muted &&
            cell.day === selectedDate.getDate() &&
            currentMonth === selectedDate.getMonth() &&
            currentYear === selectedDate.getFullYear();

          return (
            <article
              key={`${cell.day}-${index}`}
              onClick={() => {
                if (!cell.muted) {
                  onSelectDate(new Date(currentYear, currentMonth, cell.day));
                }
              }}
              onDragOver={(dragEvent) => { if (!cell.muted && draggedEvent) dragEvent.preventDefault(); }}
              onDrop={() => {
                if (draggedEvent && !cell.muted) onEventMove?.(draggedEvent, new Date(currentYear, currentMonth, cell.day));
                setDraggedEvent(null);
              }}
              className={`min-h-[84px] min-w-0 border-r border-b border-border-light p-1.5 sm:min-h-[118px] sm:p-3 ${
                index % 7 === 6 ? "border-r-0" : ""
              } ${cell.muted ? "bg-bg-main" : "bg-bg-container"} ${
                isSelected ? "bg-bg-warm" : ""
              } ${!cell.muted ? "cursor-pointer transition-colors hover:bg-bg-warm/50" : ""}`}
            >
              <div
                className={`mb-1.5 text-xs sm:mb-3 ${
                  isToday
                    ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary text-text-inverse"
                    : cell.muted
                      ? "text-text-muted"
                      : "text-text-main"
                }`}
              >
                {cell.day}
              </div>

              {/* Phones show two events per day and desktops three; the rest are counted. */}
              <div className="space-y-1 sm:space-y-1.5">
                {cell.events?.slice(0, 3).map((event, eventIndex) => (
                  <div key={`${event.id}-${eventIndex}`} className={eventIndex === 2 ? "hidden sm:block" : undefined}>
                    <EventPill compact event={event} onClick={onEventClick} onDragStart={event.source === "local" && !event.seriesId ? setDraggedEvent : undefined} />
                  </div>
                ))}
                {(cell.events?.length ?? 0) > 2 && (
                  <p className={`px-1 text-[10px] font-medium text-text-muted sm:px-2 sm:text-[11px] ${(cell.events?.length ?? 0) === 3 ? "sm:hidden" : ""}`}>
                    <span className="sm:hidden">+{(cell.events?.length ?? 0) - 2}</span>
                    <span className="hidden sm:inline">+{(cell.events?.length ?? 0) - 3} more</span>
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
