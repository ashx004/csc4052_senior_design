import { describe, expect, it } from "vitest";
import { dateAppearsInSource } from "./syllabusExtract";

const syllabus = [
  "Friday, Oct. 23th        Exam 1",
  "Friday, Oct. 30th        Drop date",
  "Sept 5    Administrivia",
  "11/25 - 11/27 Thanksgiving",
].join("\n");

describe("dateAppearsInSource", () => {
  it("accepts a date the syllabus prints, including ordinal suffixes", () => {
    expect(dateAppearsInSource("2026-10-23", syllabus)).toBe(true);
    expect(dateAppearsInSource("2026-10-30", syllabus)).toBe(true);
  });

  it("rejects a date the model invented (the wrong Exam 1 day)", () => {
    expect(dateAppearsInSource("2026-10-20", syllabus)).toBe(false);
    expect(dateAppearsInSource("2026-10-27", syllabus)).toBe(false);
  });

  it("accepts abbreviated months and numeric dates", () => {
    expect(dateAppearsInSource("2026-09-05", syllabus)).toBe(true);
    expect(dateAppearsInSource("2026-11-25", syllabus)).toBe(true);
  });

  it("accepts day-first dates, which syllabi often use", () => {
    expect(dateAppearsInSource("2026-10-23", "Fri, 23 Oct - Exam 1")).toBe(true);
    expect(dateAppearsInSource("2026-10-23", "23rd of October: Exam 1")).toBe(true);
  });

  it("still rejects a day that is not printed next to the month", () => {
    expect(dateAppearsInSource("2026-10-20", "Fri, 23 Oct - Exam 1")).toBe(false);
  });

  it("keeps non-ISO dates as written", () => {
    expect(dateAppearsInSource("Week 5", syllabus)).toBe(true);
  });
});
