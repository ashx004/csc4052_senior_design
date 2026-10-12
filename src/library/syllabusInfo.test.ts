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

  it("keeps an end date only for a real span", () => {
    const info = parseSyllabusResponse(
      JSON.stringify({
        dates: [
          { date: "2026-11-25", endDate: "2026-11-27", title: "Fall Break", kind: "holiday" },
          { date: "2026-12-02", endDate: "", title: "Midterm 2", kind: "exam" },
          { date: "2026-12-05", endDate: "2026-12-01", title: "Backwards", kind: "other" },
          { date: "Week 9", endDate: "2026-12-10", title: "Wording only", kind: "other" },
        ],
      })
    );
    expect(info.dates[0]).toEqual({ date: "2026-11-25", endDate: "2026-11-27", title: "Fall Break", kind: "holiday" });
    expect(info.dates[1]).not.toHaveProperty("endDate");
    expect(info.dates[2]).not.toHaveProperty("endDate");
    expect(info.dates[3]).not.toHaveProperty("endDate");
  });
});
