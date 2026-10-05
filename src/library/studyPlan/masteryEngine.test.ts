import { describe, expect, it } from "vitest";
import type { QuizAttemptEvidence, QuizAttemptType } from "./types";
import {
  classifyMastery,
  computeCourseMastery,
  computeDocumentMastery,
  isUnambiguousLegacyFullAttempt,
} from "./masteryEngine";

function attempt(
  id: string,
  attemptType: QuizAttemptType | undefined,
  score: number,
  total: number,
  completedAtMs: number,
  extras: Partial<QuizAttemptEvidence> = {},
): QuizAttemptEvidence {
  return {
    id,
    attemptType,
    score,
    total,
    questionIds: [],
    fullQuizQuestionCount: null,
    completedAtMs,
    ...extras,
  };
}

describe("computeDocumentMastery", () => {
  it("uses only the three newest full attempts with 1/.5/.25 weights", () => {
    const result = computeDocumentMastery([
      attempt("new", "full_quiz", 8, 10, 400),
      attempt("second", "full_quiz", 5, 10, 300),
      attempt("third", "full_quiz", 10, 10, 200),
      attempt("old", "full_quiz", 0, 10, 100),
    ]);
    expect(result?.value).toBeCloseTo(((0.8 * 1) + (0.5 * 0.5) + (1 * 0.25)) / 1.75 * 100);
    expect(result?.sourceAttemptIds).toEqual(["new", "second", "third"]);
    expect(result?.level).toBe("developing");
  });

  it("sorts by completed time so input order does not decide recency", () => {
    const result = computeDocumentMastery([
      attempt("old", "full_quiz", 0, 10, 100),
      attempt("new", "full_quiz", 10, 10, 400),
    ]);
    expect(result?.sourceAttemptIds).toEqual(["new", "old"]);
    expect(result?.value).toBeCloseTo(((1 * 1) + (0 * 0.5)) / 1.5 * 100);
  });

  it("excludes targeted practice", () => {
    expect(computeDocumentMastery([
      attempt("full", "full_quiz", 4, 10, 100),
      attempt("practice", "targeted_practice", 3, 3, 200),
    ])?.value).toBe(40);
  });

  it("returns null when every attempt is targeted practice", () => {
    expect(computeDocumentMastery([
      attempt("practice", "targeted_practice", 3, 3, 200),
    ])).toBeNull();
  });

  it("returns null when there are no attempts", () => {
    expect(computeDocumentMastery([])).toBeNull();
  });

  it("pools full attempts from multiple quiz sets without grouping", () => {
    const result = computeDocumentMastery([
      attempt("quiz-a", "full_quiz", 10, 10, 300),
      attempt("quiz-b", "full_quiz", 0, 10, 200),
    ]);
    expect(result?.sourceAttemptIds).toEqual(["quiz-a", "quiz-b"]);
    expect(result?.value).toBeCloseTo(((1 * 1) + (0 * 0.5)) / 1.5 * 100);
  });

  it("includes an unambiguous legacy full attempt", () => {
    const legacy = attempt("legacy", undefined, 8, 10, 100, {
      fullQuizQuestionCount: 10,
    });
    expect(computeDocumentMastery([legacy])).toEqual({
      value: 80,
      level: "strong",
      sourceAttemptIds: ["legacy"],
    });
  });

  it("excludes an ambiguous legacy partial retest from the document score", () => {
    expect(computeDocumentMastery([
      attempt("legacy", undefined, 2, 3, 100, { fullQuizQuestionCount: 10 }),
    ])).toBeNull();
  });

  it("treats a zero-total full attempt as a zero ratio", () => {
    expect(computeDocumentMastery([
      attempt("empty", "full_quiz", 0, 0, 100),
    ])?.value).toBe(0);
  });

  it("clamps document mastery to 0–100", () => {
    expect(computeDocumentMastery([
      attempt("over", "full_quiz", 15, 10, 100),
    ])?.value).toBe(100);
    expect(computeDocumentMastery([
      attempt("under", "full_quiz", -5, 10, 100),
    ])?.value).toBe(0);
  });
});

describe("isUnambiguousLegacyFullAttempt", () => {
  it("excludes an ambiguous legacy partial retest", () => {
    expect(isUnambiguousLegacyFullAttempt(attempt("legacy", undefined, 2, 3, 100), 10)).toBe(false);
  });

  it("includes a legacy attempt whose question set size equals the full quiz count", () => {
    expect(isUnambiguousLegacyFullAttempt(attempt("legacy", undefined, 8, 10, 100), 10)).toBe(true);
  });

  it("prefers questionIds.length when questionIds is non-empty", () => {
    expect(isUnambiguousLegacyFullAttempt(
      attempt("legacy", undefined, 2, 3, 100, {
        questionIds: ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10"],
      }),
      10,
    )).toBe(true);
    expect(isUnambiguousLegacyFullAttempt(
      attempt("legacy", undefined, 8, 10, 100, { questionIds: ["q1", "q2", "q3"] }),
      10,
    )).toBe(false);
  });

  it("never treats targeted practice as an unambiguous legacy full attempt", () => {
    expect(isUnambiguousLegacyFullAttempt(
      attempt("practice", "targeted_practice", 10, 10, 100),
      10,
    )).toBe(false);
  });

  it("returns false when fullQuizQuestionCount is null or not positive", () => {
    expect(isUnambiguousLegacyFullAttempt(attempt("legacy", undefined, 10, 10, 100), null)).toBe(false);
    expect(isUnambiguousLegacyFullAttempt(attempt("legacy", undefined, 0, 0, 100), 0)).toBe(false);
  });

  it("returns false when the attempt is already marked as a full quiz", () => {
    expect(isUnambiguousLegacyFullAttempt(
      attempt("full", "full_quiz", 10, 10, 100),
      10,
    )).toBe(false);
  });
});

describe("classifyMastery", () => {
  it("pins the weak, developing, and strong boundaries", () => {
    expect(classifyMastery(59)).toBe("weak");
    expect(classifyMastery(60)).toBe("developing");
    expect(classifyMastery(79)).toBe("developing");
    expect(classifyMastery(80)).toBe("strong");
  });
});

describe("computeCourseMastery", () => {
  it("averages only known documents and reports coverage", () => {
    expect(computeCourseMastery([{ value: 80 }, { value: 40 }], 3))
      .toEqual({ value: 60, knownDocuments: 2, totalDocuments: 3 });
  });

  it("returns null when there are no known documents", () => {
    expect(computeCourseMastery([], 4)).toBeNull();
  });
});
