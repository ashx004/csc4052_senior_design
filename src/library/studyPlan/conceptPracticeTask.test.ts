import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GENERATION_CLAIM_TTL_MS,
  claimTaskGeneration,
  conceptFocusFromTarget,
  releaseTaskGeneration,
  saveGeneratedSetId,
  startDecision,
} from "./conceptPracticeTask";
import type { ActivityTarget } from "./types";

// A one-document Firestore stand-in: update() applies dotted writes to the stored target,
// so a second transaction sees the first one's claim exactly as the real store would.
const { store, updates } = vi.hoisted(() => ({
  store: { doc: null as { activityTarget: Record<string, unknown> } | null },
  updates: [] as Record<string, unknown>[],
}));

function applyUpdate(data: Record<string, unknown>) {
  updates.push(data);
  for (const [path, value] of Object.entries(data)) {
    const field = path.replace("activityTarget.", "");
    if (store.doc) store.doc.activityTarget = { ...store.doc.activityTarget, [field]: value };
  }
}

vi.mock("@/src/library/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }),
  updateDoc: async (_ref: unknown, data: Record<string, unknown>) => applyUpdate(data),
  runTransaction: async (_db: unknown, fn: (t: unknown) => Promise<unknown>) =>
    fn({
      get: async () => ({ exists: () => store.doc !== null, data: () => store.doc }),
      update: (_ref: unknown, data: Record<string, unknown>) => applyUpdate(data),
    }),
}));

type ConceptPracticeTarget = Extract<ActivityTarget, { kind: "concept_practice" }>;

function target(overrides: Partial<ConceptPracticeTarget>): ConceptPracticeTarget {
  return {
    kind: "concept_practice",
    conceptKeys: ["joins"],
    conceptLabels: ["Joins"],
    sourceDocKeys: ["doc-1"],
    practiceType: "quiz",
    questionCount: 6,
    conceptLevels: {},
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

describe("conceptFocusFromTarget", () => {
  it("gives each quota the level stored under its normalized concept key", () => {
    const focus = conceptFocusFromTarget(
      target({
        conceptKeys: ["joins", "the indexes"],
        conceptLabels: ["Joins", "The Indexes"],
        questionCount: 6,
        conceptLevels: { joins: "challenge", indexes: "review" },
      }),
      ["Old question?"],
    );
    expect(focus.avoid).toEqual(["Old question?"]);
    expect(focus.quotas.map((q) => [q.conceptKey, q.level])).toEqual([
      ["joins", "challenge"],
      ["the indexes", "review"],
    ]);
  });

  it("still builds for a legacy task saved before conceptLevels existed", () => {
    const legacy = target({}) as Partial<ConceptPracticeTarget>;
    delete legacy.conceptLevels;
    const focus = conceptFocusFromTarget(legacy as ConceptPracticeTarget, []);
    expect(focus.quotas).toHaveLength(1);
    expect(focus.quotas[0]).not.toHaveProperty("level");
  });

  it("leaves level off a concept missing from the map", () => {
    const focus = conceptFocusFromTarget(target({ conceptLevels: {} }), []);
    expect(focus.quotas[0]).not.toHaveProperty("level");
  });

  it("splits the question count across the concepts", () => {
    const focus = conceptFocusFromTarget(
      target({ conceptKeys: ["a", "b"], conceptLabels: ["A", "B"], questionCount: 6 }),
      [],
    );
    expect(focus.quotas.map((q) => q.items)).toEqual([3, 3]);
  });
});

describe("task generation claim", () => {
  beforeEach(() => {
    store.doc = null;
    updates.length = 0;
  });

  it("writes the claim when nothing is in flight", async () => {
    store.doc = { activityTarget: target({}) };
    expect(await claimTaskGeneration("u1", "t1", 5000)).toBe(true);
    expect(updates).toEqual([{ "activityTarget.generationClaimedAtMs": 5000 }]);
  });

  it("refuses the second opener while the first claim is live", async () => {
    store.doc = { activityTarget: target({}) };
    expect(await claimTaskGeneration("u1", "t1", 5000)).toBe(true);
    // The fake store applies the first write, so the second caller sees the claim.
    expect(await claimTaskGeneration("u1", "t1", 5001)).toBe(false);
    expect(updates).toHaveLength(1);
  });

  it("claims again once a stale claim has expired", async () => {
    store.doc = { activityTarget: target({ generationClaimedAtMs: 1000 }) };
    expect(await claimTaskGeneration("u1", "t1", 1000 + GENERATION_CLAIM_TTL_MS + 1)).toBe(true);
  });

  it("refuses when the set was already generated", async () => {
    store.doc = { activityTarget: target({ generatedSetId: "set1" }) };
    expect(await claimTaskGeneration("u1", "t1", 5000)).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("refuses a task that is not concept practice", async () => {
    store.doc = { activityTarget: { kind: "quiz", quizId: "q", sourceDocKey: null, mode: "full" } };
    expect(await claimTaskGeneration("u1", "t1", 5000)).toBe(false);
  });

  it("saves the set id and clears the claim", async () => {
    store.doc = { activityTarget: target({ generationClaimedAtMs: 5000 }) };
    await saveGeneratedSetId("u1", "t1", "set9");
    expect(updates).toEqual([{ "activityTarget.generatedSetId": "set9", "activityTarget.generationClaimedAtMs": null }]);
  });

  it("releases its own claim so a retry does not wait out the TTL", async () => {
    store.doc = { activityTarget: target({ generationClaimedAtMs: 5000 }) };
    await releaseTaskGeneration("u1", "t1", 5000);
    expect(updates).toEqual([{ "activityTarget.generationClaimedAtMs": null }]);
  });

  it("leaves a newer opener's claim alone when releasing a stale one", async () => {
    store.doc = { activityTarget: target({ generationClaimedAtMs: 9000 }) };
    await releaseTaskGeneration("u1", "t1", 5000);
    expect(updates).toHaveLength(0);
    expect(store.doc.activityTarget.generationClaimedAtMs).toBe(9000);
  });
});
