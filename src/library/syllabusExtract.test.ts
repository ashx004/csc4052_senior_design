import { describe, expect, it } from "vitest";
import { fitSyllabusText } from "./syllabusExtract";

describe("fitSyllabusText", () => {
  it("leaves a normal syllabus alone", () => {
    expect(fitSyllabusText("short syllabus", 100)).toBe("short syllabus");
  });

  it("keeps the start and the end of a long one, so the back-of-syllabus schedule survives", () => {
    const text = `INSTRUCTOR Dr. Okafor ${"x".repeat(500)} SCHEDULE Midterm Oct 28`;
    const fitted = fitSyllabusText(text, 200);
    expect(fitted).toContain("INSTRUCTOR Dr. Okafor");
    expect(fitted).toContain("Midterm Oct 28");
    expect(fitted).toContain("omitted");
    expect(fitted.length).toBeLessThan(300);
  });
});
