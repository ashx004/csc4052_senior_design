import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";
import { buildTodayScheduleItems } from "./workspaceSchedule";

const at = (day: number, hour: number, minute: number) =>
  new Date(2026, 9, day, hour, minute).toISOString();

describe("buildTodayScheduleItems", () => {
  it("uses saved block times and includes only today's scheduled tasks", () => {
    const items = buildTodayScheduleItems(
      [
        { id: "later", title: "Tomorrow", status: "recommended", scheduledStart: at(5, 9, 0), scheduledEnd: at(5, 9, 20) },
        { id: "quiz", title: "Quiz", status: "recommended", scheduledStart: at(4, 16, 25), scheduledEnd: at(4, 16, 45), courseCode: "CSC 325" },
        { id: "done", title: "Review", status: "completed", scheduledStart: at(4, 15, 0), scheduledEnd: at(4, 15, 20) },
        { id: "removed", title: "Removed", status: "recommended", scheduleRemoved: true },
        { id: "unscheduled", title: "Unscheduled", status: "recommended" },
        { id: "skipped", title: "Skipped", status: "skipped", scheduledStart: at(4, 14, 0), scheduledEnd: at(4, 14, 20) },
      ],
      [],
      new Date(2026, 9, 4, 12),
    );

    expect(items.map((item) => [item.id, item.startTime, item.kind])).toEqual([
      ["done", at(4, 15, 0), "task"],
      ["quiz", at(4, 16, 25), "task"],
    ]);
    expect(items[1].courseCode).toBe("CSC 325");
  });

  it("shows timed calendar events without duplicating pushed study blocks", () => {
    const event = (id: string, startTime: string, allDay = false): CalendarEvent => ({
      id, title: id, startTime, endTime: at(4, 17, 0), allDay, source: "google",
    });
    const items = buildTodayScheduleItems(
      [{ id: "quiz", title: "Quiz", status: "recommended", scheduledStart: at(4, 16, 25), scheduledEnd: at(4, 16, 45), googleEventId: "pushed" }],
      [event("pushed", at(4, 16, 25)), event("meeting", at(4, 16, 0)), event("tomorrow", at(5, 16, 0)), event("all-day", at(4, 0, 0), true)],
      new Date(2026, 9, 4, 12),
    );

    expect(items.map((item) => [item.id, item.kind])).toEqual([
      ["meeting", "event"],
      ["quiz", "task"],
    ]);
  });
});
