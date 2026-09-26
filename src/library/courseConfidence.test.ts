import { describe, expect, it } from "vitest";
import { courseConfidence, labelFor, quizEstimate, selfEstimate } from "./courseConfidence";

const attempt = (score: number, total: number, day: number) => ({ quizName: "Q", score, total, completedAt: `2026-09-${String(day).padStart(2, "0")}T12:00:00.000Z` });

describe("quizEstimate", () => {
  it("is null without attempts and ignores empty quizzes", () => {
    expect(quizEstimate([])).toBeNull();
    expect(quizEstimate([attempt(0, 0, 1)])).toBeNull();
  });

  it("doesn't call one perfect quiz mastery", () => {
    const one = quizEstimate([attempt(10, 10, 1)])!;
    expect(one).toBeGreaterThan(0.65);
    expect(one).toBeLessThan(0.8);
  });

  it("counts a short retest in proportion to its size", () => {
    const full = { ...attempt(5, 6, 1), quizLength: 6 };
    const retest = { ...attempt(0, 1, 2), quizLength: 6 };
    expect(quizEstimate([full, retest])!).toBeGreaterThan(0.5);
    expect(quizEstimate([full, { ...retest, quizLength: undefined }])!).toBeLessThan(quizEstimate([full, retest])!);
  });

  it("weights recent attempts most", () => {
    const improving = quizEstimate([attempt(2, 10, 1), attempt(5, 10, 2), attempt(9, 10, 3)])!;
    const declining = quizEstimate([attempt(9, 10, 1), attempt(5, 10, 2), attempt(2, 10, 3)])!;
    expect(improving).toBeGreaterThan(declining);
  });
});

describe("courseConfidence", () => {
  it("explains itself with no data, self-rating only, and quizzes only", () => {
    expect(courseConfidence([], null)).toMatchObject({ combined: null, label: "no data yet" });
    expect(courseConfidence([], { level: 5, setAt: "2026-09-01T00:00:00Z" })).toMatchObject({ combined: 1, label: "strong" });
    const q = courseConfidence([attempt(3, 10, 1), attempt(4, 10, 2)]);
    expect(q.label).toBe("struggling");
    expect(q.basis).toContain("2 quiz attempts");
    expect(q.basis).toContain("not an average");
    expect(q.basis).toContain("not any quiz's score");
  });

  it("lets a newer self-rating reassure more than an old one", () => {
    const attempts = [attempt(4, 10, 10)];
    const newer = courseConfidence(attempts, { level: 5, setAt: "2026-09-20T00:00:00Z" });
    const older = courseConfidence(attempts, { level: 5, setAt: "2026-09-01T00:00:00Z" });
    expect(newer.combined!).toBeGreaterThan(older.combined!);
    expect(newer.basis).toContain("weighted equally");
  });

  it("maps ratings and labels", () => {
    expect(selfEstimate({ level: 1, setAt: "" })).toBe(0);
    expect(selfEstimate({ level: 9, setAt: "" })).toBeNull();
    expect(labelFor(0.9)).toBe("strong");
    expect(labelFor(0.5)).toBe("developing");
  });
});
