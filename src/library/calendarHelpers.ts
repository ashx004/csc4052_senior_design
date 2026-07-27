import type { CalendarDay, CalendarEvent, WeekDay } from "@/src/components/calendar/calendarTypes";

const HOUR_HEIGHT = 64; // px — matches the h-16 in WeekView/DayView row cells

// ── Date helpers ─────────────────────────────────────────────────────────────

/** Return the Monday of the week containing `date`. */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun … 6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // shift so Mon=0
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Check if two dates represent the same calendar day. */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Format a date as "YYYY-MM-DD" for grouping events. */
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Event filtering ──────────────────────────────────────────────────────────

/** Return all events that overlap with a given calendar day. */
export function getEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);

  return events.filter((ev) => {
    if (ev.allDay) {
      // All-day events: their date string matches this day's date key.
      return ev.startTime.slice(0, 10) === dateKey(day);
    }
    const start = new Date(ev.startTime);
    const end = new Date(ev.endTime);
    return start < dayEnd && end > dayStart;
  });
}

/** Return only timed (non-all-day) events for a day, sorted by start time. */
export function getTimedEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return getEventsForDay(events, day)
    .filter((ev) => !ev.allDay)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
}

/** Return only all-day events for a day. */
export function getAllDayEvents(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return getEventsForDay(events, day).filter((ev) => ev.allDay);
}

// ── Month grid ───────────────────────────────────────────────────────────────

/** Build the 5–6 row × 7 column grid for a month view. */
export function buildMonthGrid(
  year: number,
  month: number, // 0-indexed
  events: CalendarEvent[]
): CalendarDay[] {
  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay(); // 0=Sun

  // Flatten events into a map keyed by date string for fast lookup.
  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const key = ev.startTime.slice(0, 10);
    if (!eventsByDate.has(key)) eventsByDate.set(key, []);
    eventsByDate.get(key)!.push(ev);
  }

  const grid: CalendarDay[] = [];
  const totalCells = Math.ceil((startDay + daysInMonth(year, month)) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startDay + 1;
    const date = new Date(year, month, dayNum);
    const isCurrentMonth = date.getMonth() === month;
    const key = dateKey(date);

    grid.push({
      day: date.getDate(),
      muted: !isCurrentMonth,
      events: isCurrentMonth ? (eventsByDate.get(key) ?? []) : [],
    });
  }

  return grid;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// ── Week data ────────────────────────────────────────────────────────────────

/** Build the 7 WeekDay entries for a week starting at `weekStart`. */
export function buildWeekDays(weekStart: Date, selectedDate: Date): WeekDay[] {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return labels.map((label, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return {
      label,
      day: d.getDate(),
      selected: isSameDay(d, selectedDate),
    };
  });
}

/** Get the Date objects for each day in a week. */
export function getWeekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

// ── Timed event positioning ──────────────────────────────────────────────────

/**
 * Compute the pixel top offset and height for a timed event within an hour cell.
 * Returns { topPx, heightPx } relative to the start of the hour-row grid.
 */
export function getEventPosition(
  event: CalendarEvent,
  gridTopHour: number // first hour displayed in the grid (e.g. 6 for 06:00)
): { topPx: number; heightPx: number } {
  const start = new Date(event.startTime);
  const end = new Date(event.endTime);

  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour = end.getHours() + end.getMinutes() / 60;

  const topPx = (startHour - gridTopHour) * HOUR_HEIGHT;
  const heightPx = Math.max((endHour - startHour) * HOUR_HEIGHT, HOUR_HEIGHT / 2);

  return { topPx, heightPx };
}

/** Generate the array of hour labels for a time grid. */
export function buildTimeSlots(startHour: number, endHour: number): string[] {
  const slots: string[] = [];
  for (let h = startHour; h < endHour; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
  }
  return slots;
}
