import { describe, expect, it } from "vitest";
import { inferEventCategory } from "./calendarKeywordMatch";

describe("inferEventCategory", () => {
  it("detects exam keywords in title", () => {
    expect(inferEventCategory({ title: "Final Exam - CSC430" })).toBe("exam");
    expect(inferEventCategory({ title: "Midterm" })).toBe("exam");
    expect(inferEventCategory({ title: "Test 2 Review" })).toBe("exam");
  });

  it("detects deadline keywords in title", () => {
    expect(inferEventCategory({ title: "Assignment 3 Due" })).toBe("deadline");
    expect(inferEventCategory({ title: "Project deadline" })).toBe("deadline");
    expect(inferEventCategory({ title: "Homework submission" })).toBe("deadline");
  });

  it("detects class keywords in title", () => {
    expect(inferEventCategory({ title: "CSC430 Lecture" })).toBe("class");
    expect(inferEventCategory({ title: "Lab Section 2" })).toBe("class");
    expect(inferEventCategory({ title: "Office Hours" })).toBe("class");
  });

  it("falls back to description when title has no match", () => {
    expect(
      inferEventCategory({ title: "CSC430", description: "Final exam review" })
    ).toBe("exam");
  });

  it("returns null when no keywords match", () => {
    expect(inferEventCategory({ title: "Lunch with friends" })).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(inferEventCategory({ title: "FINAL EXAM" })).toBe("exam");
    expect(inferEventCategory({ title: "homework DUE" })).toBe("deadline");
  });

  it("prioritizes exam over deadline over class", () => {
    expect(
      inferEventCategory({ title: "Exam review lecture" })
    ).toBe("exam");
  });
});
