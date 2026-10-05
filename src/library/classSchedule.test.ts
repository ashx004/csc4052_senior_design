import { describe, expect, it } from "vitest";
import { getClassMeetingException, isClassMeetingOnDate, zonedClassDateTime, type StructuredClassSchedule } from "./classSchedule";

describe("class schedule generation", () => {
  const schedule: StructuredClassSchedule = { meetingDays: ["mon", "wed"], termStartDate: "2026-09-01", termEndDate: "2026-12-10" };

  it("honors meeting days and inclusive term boundaries", () => {
    expect(isClassMeetingOnDate(schedule, new Date(2026, 8, 2))).toBe(true);
    expect(isClassMeetingOnDate(schedule, new Date(2026, 8, 1))).toBe(false);
    expect(isClassMeetingOnDate(schedule, new Date(2026, 11, 14))).toBe(false);
  });

  it("finds a one-time cancellation for its date", () => {
    const exception = getClassMeetingException({ ...schedule, meetingExceptions: [{ date: "2026-09-02", cancelled: true }] }, new Date(2026, 8, 2));
    expect(exception?.cancelled).toBe(true);
  });

  it("uses the daylight-saving offset for the scheduled date", () => {
    expect(zonedClassDateTime(new Date(2026, 2, 7), "09:00", "America/Chicago").toISOString()).toBe("2026-03-07T15:00:00.000Z");
    expect(zonedClassDateTime(new Date(2026, 2, 9), "09:00", "America/Chicago").toISOString()).toBe("2026-03-09T14:00:00.000Z");
  });
});
