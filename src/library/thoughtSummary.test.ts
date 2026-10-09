import { describe, expect, it } from "vitest";
import { cleanThoughtSummary } from "./thoughtSummary";

describe("cleanThoughtSummary", () => {
  it("keeps a clean one-liner", () => {
    expect(cleanThoughtSummary("Comparing the two syllabi for overlapping exams")).toBe("Comparing the two syllabi for overlapping exams");
  });
  it("strips quotes, bullets, preamble and extra lines", () => {
    expect(cleanThoughtSummary('- "Checking the due dates"\nExtra line')).toBe("Checking the due dates");
    expect(cleanThoughtSummary("Sure, here is the note: Looking up the grading policy")).toBe("Looking up the grading policy");
  });
  it("removes leaked reasoning blocks", () => {
    expect(cleanThoughtSummary("<think>hmm</think>\nWorking out the schedule")).toBe("Working out the schedule");
  });
  it("rejects links and email addresses", () => {
    expect(cleanThoughtSummary("Reading https://example.com/secret")).toBe("");
    expect(cleanThoughtSummary("Emailing prof@school.edu about it")).toBe("");
  });
  it("shortens very long lines on a word boundary", () => {
    const out = cleanThoughtSummary("Working through " + "a very long chain of reasoning ".repeat(10));
    expect(out.length).toBeLessThanOrEqual(112);
    expect(out.endsWith("…")).toBe(true);
  });
  it("returns empty for nothing", () => {
    expect(cleanThoughtSummary("")).toBe("");
    expect(cleanThoughtSummary("   \n  ")).toBe("");
  });
});
