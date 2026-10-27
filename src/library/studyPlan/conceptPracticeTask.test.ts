import { describe, expect, it } from "vitest";
import { GENERATION_CLAIM_TTL_MS, startDecision } from "./conceptPracticeTask";
import type { ActivityTarget } from "./types";

type ConceptPracticeTarget = Extract<ActivityTarget, { kind: "concept_practice" }>;

function target(overrides: Partial<ConceptPracticeTarget>): ConceptPracticeTarget {
  return {
    kind: "concept_practice",
    conceptKeys: ["joins"],
    conceptLabels: ["Joins"],
    sourceDocKeys: ["doc-1"],
    practiceType: "quiz",
    questionCount: 6,
    generatedSetId: null,
    generationClaimedAtMs: null,
    ...overrides,
  };
}

describe("startDecision", () => {
  it("opens the set that was already generated, so a refresh never makes a new quiz", () => {
    expect(startDecision(target({ generatedSetId: "set1" }), 5000))
      .toEqual({ action: "open_existing", setId: "set1" });
  });

  it("generates when nothing has been generated and nothing is in flight", () => {
    expect(startDecision(target({}), 5000)).toEqual({ action: "generate", claimAtMs: 5000 });
  });

  it("waits rather than generating a second set while a claim is live", () => {
    expect(startDecision(target({ generationClaimedAtMs: 4000 }), 5000)).toEqual({ action: "wait" });
  });

  it("generates again once a stale claim has expired", () => {
    const stale = 5000 - GENERATION_CLAIM_TTL_MS - 1;
    expect(startDecision(target({ generationClaimedAtMs: stale }), 5000))
      .toEqual({ action: "generate", claimAtMs: 5000 });
  });

  it("prefers the existing set over a live claim", () => {
    expect(startDecision(target({ generatedSetId: "set1", generationClaimedAtMs: 4999 }), 5000))
      .toEqual({ action: "open_existing", setId: "set1" });
  });
});
