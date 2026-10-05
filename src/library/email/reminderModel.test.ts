import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALL_DAY_DUE_HOUR,
  buildPendingEmailReminders,
  resolveEventDueAt,
} from "./reminderModel";

describe("email reminder job model", () => {
  it("uses the timed event start as the default due timestamp", () => {
    expect(resolveEventDueAt({
      kind: "assignment",
      startTime: "2030-05-01T18:00:00.000Z",
      allDay: false,
    })).toBe("2030-05-01T18:00:00.000Z");
  });

  it("uses 5 PM local time for an all-day assignment until a due-time field exists", () => {
    const dueAt = resolveEventDueAt({ kind: "exam", startTime: "2030-05-01", allDay: true });
    expect(new Date(dueAt!).getHours()).toBe(DEFAULT_ALL_DAY_DUE_HOUR);
  });

  it("creates deterministic future jobs and omits stale offsets", () => {
    const dueAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const jobs = buildPendingEmailReminders({
      id: "event-1",
      title: "Project milestone",
      kind: "assignment",
      startTime: dueAt,
      dueAt,
      allDay: false,
      emailReminderOffsets: [1440, 60],
    });

    expect(jobs).toHaveLength(2);
    expect(jobs[0].jobId).toContain("event-1");
    expect(jobs[0].idempotencyKey).toContain("calendar-reminder/event-1/");

    const shortNoticeDueAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    expect(buildPendingEmailReminders({
      id: "event-2",
      title: "Short-notice assignment",
      kind: "assignment",
      startTime: shortNoticeDueAt,
      dueAt: shortNoticeDueAt,
      allDay: false,
      emailReminderOffsets: [1440],
    })).toEqual([]);
  });
});
