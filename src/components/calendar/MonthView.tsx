import { useMemo } from "react";
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
};

export default function MonthView({
  events,
  currentYear,
  currentMonth,
  selectedDate,
  onSelectDate,
}: MonthViewProps) {
  const grid = useMemo(
    () => buildMonthGrid(currentYear, currentMonth, events),
    [currentYear, currentMonth, events]
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border-light bg-bg-container">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-border-light bg-bg-container">
        {monthWeekDays.map((day) => (
          <div
            key={day}
            className="border-r border-border-light py-3 text-center text-xs font-semibold text-text-muted last:border-r-0"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
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
              className={`min-h-[118px] border-r border-b border-border-light p-3 ${
                index % 7 === 6 ? "border-r-0" : ""
              } ${cell.muted ? "bg-bg-main" : "bg-bg-container"} ${
                isSelected ? "bg-bg-warm" : ""
              } ${!cell.muted ? "cursor-pointer transition-colors hover:bg-bg-warm/50" : ""}`}
            >
              <div
                className={`mb-3 text-xs ${
                  isToday
                    ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white"
                    : cell.muted
                      ? "text-text-muted"
                      : "text-text-main"
                }`}
              >
                {cell.day}
              </div>

              <div className="space-y-1.5">
                {cell.events?.slice(0, 3).map((event, eventIndex) => (
                  <EventPill key={`${event.id}-${eventIndex}`} event={event} />
                ))}
                {(cell.events?.length ?? 0) > 3 && (
                  <p className="px-2 text-[11px] font-medium text-text-muted">
                    +{(cell.events?.length ?? 0) - 3} more
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
