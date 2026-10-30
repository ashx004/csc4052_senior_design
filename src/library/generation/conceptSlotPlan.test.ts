import { describe, expect, it } from "vitest";
import { buildBloomPlan } from "@/src/library/quizDifficulty";
import { buildConceptSlotPlan, matchesRemainingDemand, plannedLevelFor, type ConceptSlot } from "./conceptSlotPlan";

describe("buildConceptSlotPlan", () => {
  it("gives each concept its own Bloom plan at its own level", () => {
    const slots = buildConceptSlotPlan({
      quotas: [
        { conceptKey: "a", label: "A", items: 5, level: "review" },
        { conceptKey: "b", label: "B", items: 5, level: "challenge" },
      ],
      avoid: [],
    }, "exam", 10);
    expect(slots?.filter((s) => s.conceptKey === "a").map((s) => s.bloomLevel)).toEqual(buildBloomPlan("review", 5));
    expect(slots?.filter((s) => s.conceptKey === "b").map((s) => s.bloomLevel)).toEqual(buildBloomPlan("challenge", 5));
  });
  it("returns null when no quota carries a level", () => {
    expect(buildConceptSlotPlan({ quotas: [{ conceptKey: "a", label: "A", items: 3 }], avoid: [] }, "exam", 3)).toBeNull();
  });
  it("falls back to the request level for a quota without one", () => {
    const slots = buildConceptSlotPlan({
      quotas: [
        { conceptKey: "a", label: "A", items: 2, level: "review" },
        { conceptKey: "b", label: "B", items: 2 },
      ],
      avoid: [],
    }, "challenge", 4);
    expect(slots?.filter((s) => s.conceptKey === "b").map((s) => s.bloomLevel)).toEqual(buildBloomPlan("challenge", 2));
  });
  it("pads to count with the fallback level when the quotas total less", () => {
    expect(buildConceptSlotPlan({ quotas: [{ conceptKey: "a", label: "A", items: 2, level: "review" }], avoid: [] }, "exam", 4))
      .toHaveLength(4);
  });
  it("keeps the real slots first and the padding after", () => {
    const slots = buildConceptSlotPlan({ quotas: [{ conceptKey: "a", label: "A", items: 2, level: "review" }], avoid: [] }, "exam", 4);
    expect(slots?.map((s) => s.conceptKey)).toEqual(["a", "a", "", ""]);
  });
});

describe("matchesRemainingDemand", () => {
  const slots: ConceptSlot[] = [
    { conceptKey: "a", label: "A", level: "review", bloomLevel: "remember" },
    { conceptKey: "a", label: "A", level: "review", bloomLevel: "understand" },
  ];
  it("accepts a question whose concept and Bloom level are still wanted", () => {
    expect(matchesRemainingDemand(slots, [], { conceptKey: "a", bloomLevel: "remember" })).toBe(true);
  });
  it("rejects a repeat once that demand is filled", () => {
    expect(matchesRemainingDemand(slots, [{ conceptKey: "a", bloomLevel: "remember" }], { conceptKey: "a", bloomLevel: "remember" })).toBe(false);
  });
  it("rejects a question for a concept the plan never asked for", () => {
    expect(matchesRemainingDemand(slots, [], { conceptKey: "zzz", bloomLevel: "remember" })).toBe(false);
    expect(matchesRemainingDemand(slots, [], { conceptKey: null, bloomLevel: "remember" })).toBe(false);
  });
  it("rejects a Bloom level the concept no longer needs", () => {
    expect(matchesRemainingDemand(slots, [], { conceptKey: "a", bloomLevel: "evaluate" })).toBe(false);
  });
  it("ignores case and spacing in the concept key", () => {
    expect(matchesRemainingDemand(slots, [], { conceptKey: " A ", bloomLevel: "remember" })).toBe(true);
  });
});

describe("plannedLevelFor", () => {
  const slots: ConceptSlot[] = [
    { conceptKey: "a", label: "A", level: "review", bloomLevel: "remember" },
    { conceptKey: "a", label: "A", level: "review", bloomLevel: "understand" },
  ];
  it("returns the first Bloom level the concept still needs", () => {
    expect(plannedLevelFor(slots, [], "a")).toBe("remember");
    expect(plannedLevelFor(slots, [{ conceptKey: "a", bloomLevel: "remember" }], "a")).toBe("understand");
  });
  it("returns null when the concept has no demand left", () => {
    expect(plannedLevelFor(slots, [{ conceptKey: "a", bloomLevel: "remember" }, { conceptKey: "a", bloomLevel: "understand" }], "a")).toBeNull();
    expect(plannedLevelFor(slots, [], "zzz")).toBeNull();
  });
});
