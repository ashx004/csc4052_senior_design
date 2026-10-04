import { describe, expect, it } from "vitest";
import {
  googleEventBodyForTask,
  hideSyncedGoogleDuplicates,
  studyTaskToCalendarEvent,
  studyTasksToCalendarEvents,
} from "./studyTaskEvents";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";

const base = {
  id: "t1",
  title: "Quiz: Derivatives",
  status: "recommended" as const,
  courseId: "c1",
  courseCode: "MATH 101",
  scheduledStart: "2026-10-05T14:00:00.000Z",
  scheduledEnd: "2026-10-05T14:20:00.000Z",
};

describe("studyTaskToCalendarEvent", () => {
  it("projects a scheduled task to a study block", () => {
    expect(studyTaskToCalendarEvent(base)).toEqual({
      id: "study-t1",
      title: "Quiz: Derivatives",
      startTime: base.scheduledStart,
      endTime: base.scheduledEnd,
      allDay: false,
      source: "study",
      kind: "study",
      tone: "sage",
      taskId: "t1",
      done: false,
      classId: "c1",
      className: "MATH 101",
    });
  });
  it("marks a completed task's block done", () => {
    expect(studyTaskToCalendarEvent({ ...base, status: "completed" })?.done).toBe(true);
  });
  it("hides unscheduled, skipped and rescheduled tasks", () => {
    expect(studyTaskToCalendarEvent({ ...base, scheduledStart: null })).toBeNull();
    expect(studyTaskToCalendarEvent({ ...base, status: "skipped" })).toBeNull();
    expect(studyTaskToCalendarEvent({ ...base, status: "rescheduled" })).toBeNull();
  });
  it("maps a list and drops the hidden ones", () => {
    expect(studyTasksToCalendarEvents([base, { ...base, id: "t2", scheduledEnd: null }]).map((e) => e.id)).toEqual(["study-t1"]);
  });
});

describe("hideSyncedGoogleDuplicates", () => {
  it("removes Google copies of pushed study blocks", () => {
    const google = [{ id: "g1" }, { id: "g2" }] as CalendarEvent[];
    expect(hideSyncedGoogleDuplicates(google, [{ ...base, googleEventId: "g1" }]).map((e) => e.id)).toEqual(["g2"]);
  });
  it("keeps all Google events when tasks have no googleEventId", () => {
    const google = [{ id: "g1" }, { id: "g2" }] as CalendarEvent[];
    const tasks = [{ ...base, googleEventId: null }, { ...base, id: "t2" }];
    expect(hideSyncedGoogleDuplicates(google, tasks).map((e) => e.id)).toEqual(["g1", "g2"]);
  });
});

describe("googleEventBodyForTask", () => {
  it("builds a Google event body", () => {
    expect(googleEventBodyForTask(base, "America/Chicago")).toEqual({
      summary: "Quiz: Derivatives",
      description: "Study block from Catalyst (MATH 101)",
      start: { dateTime: base.scheduledStart, timeZone: "America/Chicago" },
      end: { dateTime: base.scheduledEnd, timeZone: "America/Chicago" },
    });
  });
  it("prefixes done tasks and skips unscheduled ones", () => {
    expect(googleEventBodyForTask({ ...base, status: "completed" }, "UTC")?.summary).toBe("Done: Quiz: Derivatives");
    expect(googleEventBodyForTask({ ...base, scheduledStart: null }, "UTC")).toBeNull();
  });
});
