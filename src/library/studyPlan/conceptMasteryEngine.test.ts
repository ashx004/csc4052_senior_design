import { describe, expect, it } from "vitest";
import { computeConceptMastery, type ConceptSessionEvidence } from "./conceptMasteryEngine";

function session(
  id: string,
  percent: number,
  completedAtMs: number,
): ConceptSessionEvidence {
  return {
    id,
    conceptKey: "chain rule",
    percent,
    completedAtMs,
    kind: "quiz",
  };
}

describe("computeConceptMastery", () => {
  it("weights the three most recent sessions 1, 0.5, 0.25", () => {
    const result = computeConceptMastery([
      session("s1", 100, 3000), session("s2", 0, 2000), session("s3", 0, 1000),
    ]);
    expect(result!.value).toBeCloseTo(57.14, 1);
  });

  it("ignores sessions older than the three most recent", () => {
    const result = computeConceptMastery([
      session("s1", 100, 4000), session("s2", 100, 3000),
      session("s3", 100, 2000), session("s4", 0, 1000),
    ]);
    expect(result!.value).toBe(100);
    expect(result!.sourceSessionIds).toEqual(["s1", "s2", "s3"]);
  });

  it("counts practice sessions, unlike document mastery", () => {
    const result = computeConceptMastery([
      { ...session("s1", 90, 1000), kind: "fill_blank" },
    ]);
    expect(result!.value).toBe(90);
  });

  it("ignores flashcard sessions entirely", () => {
    expect(computeConceptMastery([{ ...session("s1", 100, 1000), kind: "flashcards" }])).toBeNull();
  });

  it("returns null when there is no scored evidence", () => {
    expect(computeConceptMastery([])).toBeNull();
  });

  it("labels 80 and above as strong, matching the retirement threshold", () => {
    expect(computeConceptMastery([session("s1", 80, 1000)])!.level).toBe("strong");
  });
});
