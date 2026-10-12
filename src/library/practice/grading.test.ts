import { describe, expect, it } from "vitest";
import { gradeBlank, gradeFillBlank, gradeNumeric, isTypo, normalizeAnswer, parseNumber, totalScore } from "./grading";

describe("normalizeAnswer", () => {
  it("ignores case, accents, punctuation, articles and spacing", () => {
    expect(normalizeAnswer("  The  Mitochondria. ")).toBe("mitochondria");
    expect(normalizeAnswer("Café")).toBe("cafe");
    expect(normalizeAnswer("“ATP”")).toBe("atp");
    expect(normalizeAnswer("an  apple")).toBe("apple");
  });
  it("keeps what matters in formulas and numbers", () => {
    expect(normalizeAnswer("x^2 + 1")).toBe("x^2 + 1");
    expect(normalizeAnswer("-3.5")).toBe("-3.5");
    expect(normalizeAnswer("50%")).toBe("50%");
  });
});

describe("isTypo", () => {
  it("allows one slip in longer words and two in long phrases", () => {
    expect(isTypo("osmosi", "osmosis")).toBe(true); // 7 letters: one slip is fine
    expect(isTypo("osmoss", "osmosis")).toBe(true);
    expect(isTypo("osmoxxs", "osmosis")).toBe(false); // ...two is not
    expect(isTypo("mitochondira", "mitochondria")).toBe(true);
    expect(isTypo("cristea", "cristae")).toBe(true); // swapped neighbours are one slip, not two
    expect(isTypo("ctristae", "cristae")).toBe(true);
    expect(isTypo("crstiea", "cristae")).toBe(false); // two separate slips in a 7-letter word
  });
  it("rejects short words and numbers", () => {
    expect(isTypo("cat", "cut")).toBe(false);
    expect(isTypo("1000", "1001")).toBe(false);
    expect(isTypo("diffusoin", "osmosis")).toBe(false);
  });
});

describe("gradeBlank", () => {
  const blank = { answer: "mitochondria", alternatives: ["mitochondrion"] };
  it("accepts the answer and its alternatives", () => {
    expect(gradeBlank("Mitochondria", blank)).toEqual({ correct: true, typo: false });
    expect(gradeBlank("the mitochondrion", blank)).toEqual({ correct: true, typo: false });
  });
  it("accepts a slight misspelling but flags it", () => {
    expect(gradeBlank("mitochondira", blank)).toEqual({ correct: true, typo: true });
  });
  it("rejects wrong and empty answers", () => {
    expect(gradeBlank("nucleus", blank)).toEqual({ correct: false, typo: false });
    expect(gradeBlank("   ", blank)).toEqual({ correct: false, typo: false });
  });
  it("compares numeric blanks as numbers", () => {
    const n = { answer: "1000", alternatives: [] };
    expect(gradeBlank("1,000", n).correct).toBe(true);
    expect(gradeBlank("1000.0", n).correct).toBe(true);
    expect(gradeBlank("1001", n).correct).toBe(false);
    expect(gradeBlank("1/2", { answer: "0.5", alternatives: [] }).correct).toBe(true);
  });
});

describe("gradeFillBlank", () => {
  it("scores the fraction of blanks right", () => {
    const blanks = [
      { answer: "ATP", alternatives: [] },
      { answer: "cytoplasm", alternatives: [] },
    ];
    expect(gradeFillBlank(["atp", "nucleus"], blanks).score).toBe(0.5);
    expect(gradeFillBlank(["atp"], blanks).score).toBe(0.5);
    expect(gradeFillBlank([], [])).toEqual({ score: 0, perBlank: [] });
  });
});

describe("parseNumber", () => {
  it("reads common number formats", () => {
    expect(parseNumber("1,250")?.value).toBe(1250);
    expect(parseNumber("$3.50")?.value).toBe(3.5);
    expect(parseNumber("about 75 km/h")?.value).toBe(75);
    expect(parseNumber("3/4")?.value).toBe(0.75);
    expect(parseNumber("1 1/2")?.value).toBe(1.5);
    expect(parseNumber("2.5e3")?.value).toBe(2500);
    expect(parseNumber("-4")?.value).toBe(-4);
    expect(parseNumber("four")?.value).toBe(4);
    expect(parseNumber("25%")).toEqual({ value: 25, percent: true });
  });
  it("returns null when there is no number", () => {
    expect(parseNumber("none")).toBeNull();
    expect(parseNumber("")).toBeNull();
  });
});

describe("gradeNumeric", () => {
  const item = { expectedAnswer: "75", tolerance: 0.01 };
  it("accepts the answer with units, commas or small rounding", () => {
    expect(gradeNumeric("75", item).correct).toBe(true);
    expect(gradeNumeric("75 km/h", item).correct).toBe(true);
    expect(gradeNumeric("75.3", item).correct).toBe(true);
    expect(gradeNumeric("76", item).correct).toBe(false);
  });
  it("reports what number it read", () => {
    expect(gradeNumeric("it is 76", item).read).toBe(76);
    expect(gradeNumeric("no idea", item)).toEqual({ correct: false, read: null });
  });
  it("treats percent and fraction forms as the same answer", () => {
    expect(gradeNumeric("25%", { expectedAnswer: "0.25" }).correct).toBe(true);
    expect(gradeNumeric("0.25", { expectedAnswer: "25%" }).correct).toBe(true);
    expect(gradeNumeric("1/4", { expectedAnswer: "0.25" }).correct).toBe(true);
  });
  it("handles zero and negative answers", () => {
    expect(gradeNumeric("0", { expectedAnswer: "0" }).correct).toBe(true);
    expect(gradeNumeric("0.5", { expectedAnswer: "0" }).correct).toBe(false);
    expect(gradeNumeric("-3", { expectedAnswer: "-3" }).correct).toBe(true);
  });
  it("uses a custom tolerance", () => {
    expect(gradeNumeric("9.8", { expectedAnswer: "9.81", tolerance: 0.001 }).correct).toBe(false);
    expect(gradeNumeric("9.8", { expectedAnswer: "9.81", tolerance: 0.01 }).correct).toBe(true);
  });
});

describe("totalScore", () => {
  it("adds up partial credit", () => {
    expect(totalScore([{ itemId: "a", score: 1, response: null }, { itemId: "b", score: 0.5, response: null }, { itemId: "c", score: 0, response: null }])).toEqual({ score: 1.5, total: 3, percent: 50 });
    expect(totalScore([])).toEqual({ score: 0, total: 0, percent: 0 });
  });
});
