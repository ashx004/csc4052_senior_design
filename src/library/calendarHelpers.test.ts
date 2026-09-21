import { describe, expect, it } from "vitest";
import { buildMonthGrid, getEventsForDay } from "./calendarHelpers";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";

const eveningEvent: CalendarEvent = {
  id: "event-1",
  title: "CSC430 Quiz",
  startTime: "2026-09-21T03:40:00.000Z", // Sep 20, 10:40 PM in America/Chicago
  endTime: "2026-09-21T04:40:00.000Z",
  allDay: false,
  source: "local",
};

describe("calendar event date grouping", () => {
  it("keeps a late-evening local event on the user's local day", () => {
    const grid = buildMonthGrid(2026, 8, [eveningEvent]);
    const day20 = grid.find((cell) => cell.day === 20 && !cell.muted);
    const day21 = grid.find((cell) => cell.day === 21 && !cell.muted);

    expect(day20?.events).toContainEqual(eveningEvent);
    expect(day21?.events).toEqual([]);
  });

  it("uses local date matching when filtering events for a day", () => {
    expect(getEventsForDay([eveningEvent], new Date(2026, 8, 20))).toEqual([
      eveningEvent,
    ]);
    expect(getEventsForDay([eveningEvent], new Date(2026, 8, 21))).toEqual([]);
  });
});
