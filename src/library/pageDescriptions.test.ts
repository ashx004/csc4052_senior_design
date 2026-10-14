import { describe, expect, it } from "vitest";
import { describePage } from "./pageDescriptions";

describe("describePage", () => {
  it("names the class on course pages", () => {
    const page = describePage("/courses/c1/practice", "CSC 4052 - Senior Design");
    expect(page?.label).toBe("CSC 4052 - Senior Design practice");
    expect(page?.summary).toContain("Practice exams");
  });

  it("falls back to a generic class name before the class has loaded", () => {
    expect(describePage("/courses/c1/quizzes", null)?.summary).toContain("this class");
  });

  it("is honest about placeholder pages", () => {
    for (const path of ["/courses/c1/assignments", "/courses/c1/due-dates", "/courses/c1/summaries", "/summary"]) {
      expect(describePage(path, "Calc")?.summary, path).toContain("placeholder");
    }
  });

  it("tells a single note apart from the Notes list and OCR", () => {
    expect(describePage("/notes")?.label).toBe("Notes");
    expect(describePage("/notes/ocr")?.label).toBe("OCR");
    expect(describePage("/notes/abc123")?.label).toBe("A note");
  });

  it("describes the main dashboard pages", () => {
    for (const path of ["/dashboard", "/learning", "/discover", "/advising_new", "/settings", "/profile", "/help", "/calendar", "/classes", "/custom/new", "/custom/s1"]) {
      expect(describePage(path), path).not.toBeNull();
    }
  });

  it("returns nothing for unknown pages and for no path", () => {
    expect(describePage("/somewhere-else")).toBeNull();
    expect(describePage(null)).toBeNull();
  });
});
