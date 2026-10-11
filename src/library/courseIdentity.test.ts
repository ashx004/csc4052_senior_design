import { describe, expect, it } from "vitest";
import { buildCourseIdentityUpdate } from "./courseIdentity";

describe("buildCourseIdentityUpdate", () => {
  it("trims, collapses spaces and derives subject/number", () => {
    expect(buildCourseIdentityUpdate({ classCode: "  csc   4550 ", className: " Software  Engineering " })).toEqual({
      ok: true,
      classCode: "csc 4550",
      className: "Software Engineering",
      subject: "CSC",
      courseNumber: "4550",
    });
  });
  it("clears the structured mirrors when the code is free-form", () => {
    const r = buildCourseIdentityUpdate({ classCode: "Honors Seminar", className: "x" });
    expect(r).toMatchObject({ ok: true, subject: null, courseNumber: null });
  });
  it("rejects empty or oversized values", () => {
    expect(buildCourseIdentityUpdate({ classCode: " ", className: "x" }).ok).toBe(false);
    expect(buildCourseIdentityUpdate({ classCode: "A1", className: "" }).ok).toBe(false);
    expect(buildCourseIdentityUpdate({ classCode: "A".repeat(30), className: "x" }).ok).toBe(false);
  });
});
