import { describe, expect, it } from "vitest";
import { parseSyllabusResponse } from "./syllabusInfo";

describe("parseSyllabusResponse", () => {
  it("parses a clean reply and normalises whitespace", () => {
    const info = parseSyllabusResponse(
      JSON.stringify({
        classSchedule: "Mon/Wed  ",
        time: "10:00 AM",
        facultyEmail: "prof@school.edu",
        grading: ["Exams 60%", "Homework 40%"],
        dates: [{ date: "2026-10-12", title: "Midterm", kind: "exam" }],
      })
    );
    expect(info.classSchedule).toBe("Mon/Wed");
    expect(info.grading).toBe("Exams 60%; Homework 40%");
    expect(info.dates).toEqual([{ date: "2026-10-12", title: "Midterm", kind: "exam" }]);
  });

  it("copes with code fences, preamble and trailing text", () => {
    const info = parseSyllabusResponse('Sure!\n```json\n{"classRoom": "Nethken 211"}\n```\nHope that helps');
    expect(info.classRoom).toBe("Nethken 211");
  });

  it("drops invalid emails, incomplete dates and unknown kinds", () => {
    const info = parseSyllabusResponse(
      JSON.stringify({ facultyEmail: "call me", dates: [{ date: "", title: "x" }, { date: "Week 3", title: "Quiz", kind: "pop" }, 4] })
    );
    expect(info.facultyEmail).toBe("");
    expect(info.dates).toEqual([{ date: "Week 3", title: "Quiz", kind: "other" }]);
  });

  it("returns an empty result for garbage", () => {
    expect(parseSyllabusResponse("no json here").dates).toEqual([]);
    expect(parseSyllabusResponse("[]").classSchedule).toBe("");
  });
});
