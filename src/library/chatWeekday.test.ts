import { describe, expect, it } from "vitest";
import { weekdayDateNote } from "./chatTime";

// Monday, October 19, 2026, 1:30 AM in Chicago.
const monday = new Date("2026-10-19T06:30:00Z");
const tz = "America/Chicago";

describe("weekdayDateNote", () => {
  it("pins next/this/plain weekdays to the first one after today", () => {
    expect(weekdayDateNote("Add office hours next Tuesday at 2pm", monday, tz)).toContain('"next Tuesday" = Tue, Oct 20, 2026');
    expect(weekdayDateNote("study on Friday", monday, tz)).toContain('"on Friday" = Fri, Oct 23, 2026');
    expect(weekdayDateNote("this Monday", monday, tz)).toContain("Mon, Oct 26, 2026");
  });

  it("leaves past, recurring and week-later phrasing alone", () => {
    expect(weekdayDateNote("what did I do last Tuesday", monday, tz)).toBeNull();
    expect(weekdayDateNote("I have lab on Tuesdays", monday, tz)).toBeNull();
    expect(weekdayDateNote("Tuesday next week", monday, tz)).toBeNull();
    expect(weekdayDateNote("no days here", monday, tz)).toBeNull();
  });

  it("uses the student's time zone for today", () => {
    // 11 PM Sunday in Chicago is already Monday in UTC.
    const sundayNight = new Date("2026-10-19T04:00:00Z");
    expect(weekdayDateNote("next Monday", sundayNight, tz)).toContain("Mon, Oct 19, 2026");
  });
});
