import { describe, expect, it } from "vitest";
import {
  formatTerm,
  getCurrentTerm,
  getNextTerm,
  normalizeCourseCode,
  parseCourseCode,
  parseTermString,
} from "./academicTerm";

// Constructed with the local-time Date(year, monthIndex, day) form
// throughout this suite, not ISO date-only strings ("2026-07-01") — those
// parse as UTC midnight per spec, which getMonth()/getFullYear() then read
// back in local time, silently shifting the date near month boundaries on
// any machine west of UTC.
describe("getCurrentTerm", () => {
  it.each([
    [new Date(2026, 8, 1), "Fall", 2026],
    [new Date(2026, 11, 31), "Fall", 2026],
    [new Date(2026, 0, 1), "Winter", 2026],
    [new Date(2026, 2, 31), "Winter", 2026],
    [new Date(2026, 3, 1), "Spring", 2026],
    [new Date(2026, 5, 30), "Spring", 2026],
    [new Date(2026, 6, 1), "Summer", 2026],
    [new Date(2026, 7, 31), "Summer", 2026],
  ])("classifies %s as %s %d", (date, term, year) => {
    expect(getCurrentTerm(date)).toEqual({ term, year });
  });
});

describe("getNextTerm", () => {
  it("rolls Fall over into next year's Winter", () => {
    expect(getNextTerm(new Date(2026, 8, 15))).toEqual({ term: "Winter", year: 2027 });
  });

  it("advances Winter -> Spring within the same year", () => {
    expect(getNextTerm(new Date(2026, 1, 1))).toEqual({ term: "Spring", year: 2026 });
  });

  it("advances Spring -> Summer within the same year", () => {
    expect(getNextTerm(new Date(2026, 4, 1))).toEqual({ term: "Summer", year: 2026 });
  });

  it("advances Summer -> Fall within the same year", () => {
    expect(getNextTerm(new Date(2026, 6, 15))).toEqual({ term: "Fall", year: 2026 });
  });
});

describe("formatTerm", () => {
  it("joins term and year", () => {
    expect(formatTerm({ term: "Fall", year: 2026 })).toBe("Fall 2026");
  });
});

describe("parseTermString", () => {
  it("returns null for empty/undefined/null input", () => {
    expect(parseTermString(undefined)).toBeNull();
    expect(parseTermString(null)).toBeNull();
    expect(parseTermString("")).toBeNull();
    expect(parseTermString("   ")).toBeNull();
  });

  it("parses a full season name with a 4-digit year", () => {
    expect(parseTermString("Fall 2026")).toEqual({ term: "Fall", year: 2026 });
  });

  it("parses season/year in reversed order", () => {
    expect(parseTermString("2026 Fall")).toEqual({ term: "Fall", year: 2026 });
  });

  it("parses a 2-digit year as 20xx", () => {
    expect(parseTermString("Fall 26")).toEqual({ term: "Fall", year: 2026 });
  });

  it("parses abbreviations like F26", () => {
    expect(parseTermString("F26")).toEqual({ term: "Fall", year: 2026 });
  });

  it("returns null when no season is present", () => {
    expect(parseTermString("2026")).toBeNull();
  });

  it("returns null when no year is present", () => {
    expect(parseTermString("Fall")).toBeNull();
  });
});

describe("parseCourseCode", () => {
  it("returns null for empty/undefined/null input", () => {
    expect(parseCourseCode(undefined)).toBeNull();
    expect(parseCourseCode(null)).toBeNull();
    expect(parseCourseCode("")).toBeNull();
  });

  it.each([
    ["CSC 4550", "CSC", "4550"],
    ["CSC4550", "CSC", "4550"],
    ["csc-4550", "CSC", "4550"],
  ])("parses %s", (raw, subject, number) => {
    expect(parseCourseCode(raw)).toEqual({ subject, number });
  });

  it("returns null for text with no leading letters", () => {
    expect(parseCourseCode("4550")).toBeNull();
  });
});

describe("normalizeCourseCode", () => {
  it("returns an empty string for empty/undefined/null input", () => {
    expect(normalizeCourseCode(undefined)).toBe("");
    expect(normalizeCourseCode(null)).toBe("");
    expect(normalizeCourseCode("")).toBe("");
  });

  it.each([
    ["CSC 4550", "CSC4550"],
    ["csc-4550", "CSC4550"],
    ["CSC4550", "CSC4550"],
  ])("normalizes %s to %s", (raw, expected) => {
    expect(normalizeCourseCode(raw)).toBe(expected);
  });
});
