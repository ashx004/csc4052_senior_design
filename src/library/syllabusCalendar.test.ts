import { describe, expect, it } from "vitest";
import {
  calendarKindFor,
  nextDay,
  planSyllabusEvents,
  resolveSyllabusDate,
  resolveSyllabusRange,
  reviewSyllabusDates,
  storedSyllabusDates,
  syllabusEventId,
} from "./syllabusCalendar";

const NOW = new Date(2026, 8, 1); // Sept 1, 2026

describe("resolveSyllabusDate", () => {
  it("accepts ISO dates and rejects impossible ones", () => {
    expect(resolveSyllabusDate("2026-10-15")).toBe("2026-10-15");
    expect(resolveSyllabusDate("2026-02-30")).toBeNull();
    expect(resolveSyllabusDate("2026-13-01")).toBeNull();
  });

  it("reads month names, with and without a year", () => {
    expect(resolveSyllabusDate("October 15, 2026", "", NOW)).toBe("2026-10-15");
    expect(resolveSyllabusDate("Oct 15", "Fall 2026", NOW)).toBe("2026-10-15");
    expect(resolveSyllabusDate("Tuesday, Oct. 15th", "Fall 2026", NOW)).toBe("2026-10-15");
    expect(resolveSyllabusDate("15 October 2026", "", NOW)).toBe("2026-10-15");
    expect(resolveSyllabusDate("Sept 3", "", NOW)).toBe("2026-09-03");
  });

  it("reads US numeric dates", () => {
    expect(resolveSyllabusDate("10/15/2026")).toBe("2026-10-15");
    expect(resolveSyllabusDate("10/15/26")).toBe("2026-10-15");
    expect(resolveSyllabusDate("3/9", "Spring 2027", NOW)).toBe("2027-03-09");
  });

  it("puts a fall term's January dates in the next year", () => {
    expect(resolveSyllabusDate("Jan 12", "Fall 2026", NOW)).toBe("2027-01-12");
    expect(resolveSyllabusDate("Dec 10", "Fall 2026", NOW)).toBe("2026-12-10");
    expect(resolveSyllabusDate("Jan 12", "Spring 2027", NOW)).toBe("2027-01-12");
  });

  it("falls back to the current year when the term has none", () => {
    expect(resolveSyllabusDate("Nov 3", "", NOW)).toBe("2026-11-03");
  });

  it("returns null for wording that isn't a day", () => {
    for (const text of ["Week 3", "Finals week", "TBA", "", "   ", "Mid-semester"]) {
      expect(resolveSyllabusDate(text, "Fall 2026", NOW)).toBeNull();
    }
  });
});

describe("nextDay", () => {
  it("rolls over months and years", () => {
    expect(nextDay("2026-10-15")).toBe("2026-10-16");
    expect(nextDay("2026-10-31")).toBe("2026-11-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(nextDay("2028-02-28")).toBe("2028-02-29");
  });
});

describe("reviewSyllabusDates", () => {
  const reviewed = reviewSyllabusDates(
    [
      { date: "2026-10-12", title: "Midterm", kind: "exam" },
      { date: "Oct 20", title: "Project proposal", kind: "assignment" },
      { date: "Finals week", title: "Final exam", kind: "exam" },
      { date: "2026-11-26", title: "Thanksgiving", kind: "holiday" },
    ],
    "Fall 2026",
    NOW
  );

  it("resolves days and pre-selects only datable exams", () => {
    expect(reviewed.map((d) => d.iso)).toEqual(["2026-10-12", "2026-10-20", "", "2026-11-26"]);
    expect(reviewed.map((d) => d.addToCalendar)).toEqual([true, false, false, false]);
  });

  it("stores the resolved day instead of the wording", () => {
    expect(storedSyllabusDates(reviewed).map((d) => d.date)).toEqual(["2026-10-12", "2026-10-20", "Finals week", "2026-11-26"]);
  });

  it("drops entries whose title was cleared", () => {
    expect(storedSyllabusDates([{ ...reviewed[0], title: "  " }])).toEqual([]);
  });
});

describe("planSyllabusEvents", () => {
  const course = { courseId: "abc123XYZ", classCode: "CSC 4052", className: "Senior Design" };

  it("builds all-day events with exam reminders only for ticked, datable entries", () => {
    const planned = planSyllabusEvents(
      [
        { date: "2026-10-12", iso: "2026-10-12", endIso: "", title: "Midterm", kind: "exam", addToCalendar: true },
        { date: "2026-10-20", iso: "2026-10-20", endIso: "", title: "Proposal", kind: "assignment", addToCalendar: false },
        { date: "Finals week", iso: "", endIso: "", title: "Final", kind: "exam", addToCalendar: true },
      ],
      course
    );
    expect(planned).toHaveLength(1);
    expect(planned[0].data).toMatchObject({
      title: "CSC 4052: Midterm",
      startTime: "2026-10-12",
      endTime: "2026-10-13",
      allDay: true,
      kind: "exam",
      classId: "abc123XYZ",
      origin: "syllabus",
    });
  });

  it("gives the same event the same id every time, and merges duplicates", () => {
    const a = syllabusEventId("abc123XYZ", "2026-10-12", "Midterm");
    expect(syllabusEventId("abc123XYZ", "2026-10-12", "  midterm ")).toBe(a);
    expect(syllabusEventId("abc123XYZ", "2026-10-13", "Midterm")).not.toBe(a);
    expect(syllabusEventId("other", "2026-10-12", "Midterm")).not.toBe(a);
    const dup = { date: "x", iso: "2026-10-12", endIso: "", title: "Midterm", kind: "exam" as const, addToCalendar: true };
    expect(planSyllabusEvents([dup, { ...dup, title: "midterm" }], course)).toHaveLength(1);
  });

  it("maps syllabus kinds to calendar kinds", () => {
    expect(calendarKindFor("exam")).toBe("exam");
    expect(calendarKindFor("assignment")).toBe("assignment");
    expect(calendarKindFor("holiday")).toBe("event");
    expect(calendarKindFor("other")).toBe("event");
  });
});

describe("multi-day dates", () => {
  const course = { courseId: "course1", classCode: "BIO 101", className: "Intro Biology" };

  it("reads a span of days", () => {
    expect(resolveSyllabusRange("Nov 25-27", "Fall 2026", NOW)).toEqual({ start: "2026-11-25", end: "2026-11-27" });
    expect(resolveSyllabusRange("November 25 \u2013 27, 2026", "", NOW)).toEqual({ start: "2026-11-25", end: "2026-11-27" });
    expect(resolveSyllabusRange("Nov 25 to Nov 27", "Fall 2026", NOW)).toEqual({ start: "2026-11-25", end: "2026-11-27" });
    expect(resolveSyllabusRange("11/25-11/27", "Fall 2026", NOW)).toEqual({ start: "2026-11-25", end: "2026-11-27" });
    expect(resolveSyllabusRange("Dec 20 - Jan 5", "Fall 2026", NOW)).toEqual({ start: "2026-12-20", end: "2027-01-05" });
  });

  it("leaves single days and unplaceable wording alone", () => {
    expect(resolveSyllabusRange("Oct 15", "Fall 2026", NOW)).toEqual({ start: "2026-10-15", end: null });
    expect(resolveSyllabusRange("2026-10-15", "", NOW)).toEqual({ start: "2026-10-15", end: null });
    expect(resolveSyllabusRange("Finals week", "Fall 2026", NOW)).toBeNull();
    // A range that ends before it starts is not trusted.
    expect(resolveSyllabusRange("Nov 27-25", "Fall 2026", NOW)).toEqual({ start: "2026-11-27", end: null });
  });

  it("keeps the last day through review, storage and the calendar", () => {
    const [fromWording] = reviewSyllabusDates([{ date: "Nov 25-27", title: "Fall Break", kind: "holiday" }], "Fall 2026", NOW);
    expect(fromWording).toMatchObject({ iso: "2026-11-25", endIso: "2026-11-27" });
    const [fromModel] = reviewSyllabusDates([{ date: "2026-11-25", endDate: "2026-11-27", title: "Fall Break", kind: "holiday" }], "Fall 2026", NOW);
    expect(fromModel.endIso).toBe("2026-11-27");

    expect(storedSyllabusDates([fromModel])).toEqual([{ date: "2026-11-25", endDate: "2026-11-27", title: "Fall Break", kind: "holiday" }]);

    const [event] = planSyllabusEvents([{ ...fromModel, addToCalendar: true }], course);
    expect(event.data).toMatchObject({ startTime: "2026-11-25", endTime: "2026-11-28", allDay: true });
  });

  it("ignores a bad end date", () => {
    const [entry] = reviewSyllabusDates([{ date: "2026-11-25", endDate: "2026-11-20", title: "Break", kind: "holiday" }], "Fall 2026", NOW);
    expect(entry.endIso).toBe("");
    expect(storedSyllabusDates([entry])[0]).not.toHaveProperty("endDate");
    const [event] = planSyllabusEvents([{ ...entry, addToCalendar: true }], course);
    expect(event.data.endTime).toBe("2026-11-26");
  });
});
