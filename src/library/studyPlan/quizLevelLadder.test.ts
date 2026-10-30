import { describe, expect, it } from "vitest";
import { chooseConceptLevel, entryLevel, type ConceptLevelInput } from "./quizLevelLadder";

describe("entryLevel", () => {
  it("starts an unmeasured concept in a strong document at exam", () => {
    expect(entryLevel(0.9)).toBe("exam");
  });
  it("starts at review when the document is weak or unknown", () => {
    expect(entryLevel(0.4)).toBe("review");
    expect(entryLevel(null)).toBe("review");
  });
  it("never enters at challenge", () => {
    expect(entryLevel(1)).not.toBe("challenge");
  });
  it("treats 0.8 as the strong boundary on the 0-1 scale", () => {
    expect(entryLevel(0.8)).toBe("exam");
  });
  it("keeps 0.79 just below the strong boundary", () => {
    expect(entryLevel(0.79)).toBe("review");
  });
});

describe("chooseConceptLevel", () => {
  const base: ConceptLevelInput = {
    conceptMastery: null, documentMastery: null,
    lastAskedLevel: null, repeatMissCount: 0, daysUntilExam: null,
  };
  it("maps concept mastery to the three rungs", () => {
    expect(chooseConceptLevel({ ...base, conceptMastery: 40, lastAskedLevel: "review" })).toBe("review");
    expect(chooseConceptLevel({ ...base, conceptMastery: 70, lastAskedLevel: "review" })).toBe("exam");
    expect(chooseConceptLevel({ ...base, conceptMastery: 90, lastAskedLevel: "exam" })).toBe("challenge");
  });
  it("clamps to one rung up from the level last asked", () => {
    expect(chooseConceptLevel({ ...base, conceptMastery: 90, lastAskedLevel: "review" })).toBe("exam");
  });
  it("clamps to one rung down after a bad session", () => {
    expect(chooseConceptLevel({ ...base, conceptMastery: 30, lastAskedLevel: "challenge" })).toBe("exam");
  });
  it("bumps one rung for an exam within three days, still clamped to one rung", () => {
    expect(chooseConceptLevel({ ...base, conceptMastery: 70, lastAskedLevel: "exam", daysUntilExam: 2 })).toBe("challenge");
    expect(chooseConceptLevel({ ...base, conceptMastery: 70, lastAskedLevel: "review", daysUntilExam: 2 })).toBe("exam");
  });
  it("bumps at exactly three days out, clamp still visible", () => {
    expect(chooseConceptLevel({ ...base, conceptMastery: 70, lastAskedLevel: "review", daysUntilExam: 3 })).toBe("exam");
  });
  it("does not bump for an exam further out", () => {
    expect(chooseConceptLevel({ ...base, conceptMastery: 70, lastAskedLevel: "exam", daysUntilExam: 9 })).toBe("exam");
  });
  it("holds a repeatedly missed concept at review even with an exam in two days", () => {
    expect(chooseConceptLevel({ ...base, conceptMastery: 70, lastAskedLevel: "exam", repeatMissCount: 2, daysUntilExam: 2 })).toBe("review");
  });
  it("steps a repeatedly missed challenge down to exam, not review", () => {
    expect(chooseConceptLevel({ ...base, conceptMastery: 90, lastAskedLevel: "challenge", repeatMissCount: 2 })).toBe("exam");
  });
  it("holds at review with no last-asked level to clamp against", () => {
    expect(chooseConceptLevel({ ...base, conceptMastery: 90, repeatMissCount: 2 })).toBe("review");
  });
  // Review Focus 1
  it("enters at review when neither concept nor document mastery is known", () => {
    expect(chooseConceptLevel(base)).toBe("review");
  });
  it("seeds from document mastery when the concept has no evidence", () => {
    expect(chooseConceptLevel({ ...base, documentMastery: 0.9 })).toBe("exam");
  });
});
