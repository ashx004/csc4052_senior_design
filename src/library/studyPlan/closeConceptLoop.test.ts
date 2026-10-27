import { describe, expect, it } from "vitest";
import { applyFocusedSession, type FocusedSessionResult } from "./closeConceptLoop";
import type { ScoredItem } from "./conceptRetirement";
import type { ConceptWeakSpot } from "./types";

function open(conceptKey: string): ConceptWeakSpot {
  return {
    courseId: "course-1",
    conceptKey,
    label: conceptKey,
    misses: [],
    sourceDocKeys: [],
    status: "open",
    openedAtMs: 1,
    retiredAtMs: null,
    timesReopened: 0,
  };
}

function item(conceptKey: string, score: number): ScoredItem {
  return { conceptKey, score };
}

function session(items: ScoredItem[]): FocusedSessionResult {
  return {
    sessionId: "session-1",
    courseId: "course-1",
    kind: "quiz",
    completedAtMs: 1_000,
    items,
  };
}

describe("applyFocusedSession", () => {
  it("retires one concept and leaves the other open from the same session", () => {
    const out = applyFocusedSession([open("chain rule"), open("product rule")], session([
      item("chain rule", 1), item("chain rule", 1), item("chain rule", 1),
      item("product rule", 1), item("product rule", 0), item("product rule", 0),
    ]));
    expect(out.retired).toEqual(["chain rule"]);
    expect(out.weakSpots.find((w) => w.conceptKey === "product rule")!.status).toBe("open");
  });

  it("records the retirement timestamp and keeps the weak spot rather than deleting it", () => {
    const out = applyFocusedSession([open("chain rule")], session([
      item("chain rule", 1), item("chain rule", 1), item("chain rule", 1),
    ]));
    const spot = out.weakSpots.find((w) => w.conceptKey === "chain rule")!;
    expect(spot.status).toBe("retired");
    expect(spot.retiredAtMs).not.toBeNull();
  });

  it("reopens a retired concept that scores badly and counts the reopening", () => {
    const retired = { ...open("chain rule"), status: "retired" as const, retiredAtMs: 500 };
    const out = applyFocusedSession([retired], session([
      item("chain rule", 0), item("chain rule", 0), item("chain rule", 1),
    ]));
    expect(out.reopened).toEqual(["chain rule"]);
    expect(out.weakSpots[0].timesReopened).toBe(1);
  });

  it("records mastery but does not retire on a flashcard session", () => {
    const out = applyFocusedSession([open("chain rule")], {
      ...session([item("chain rule", 1), item("chain rule", 1), item("chain rule", 1)]),
      kind: "flashcards",
    });
    expect(out.retired).toEqual([]);
    expect(out.weakSpots[0].status).toBe("open");
  });

  it("does not retire when self-marking leaves too few machine-scored items", () => {
    const out = applyFocusedSession([open("chain rule")], session([
      { conceptKey: "chain rule", score: 1, selfMarked: true },
      { conceptKey: "chain rule", score: 1, selfMarked: true },
      { conceptKey: "chain rule", score: 1 },
    ]));
    expect(out.retired).toEqual([]);
  });

  it("ignores items for a concept that has no weak spot", () => {
    const out = applyFocusedSession([], session([item("chain rule", 1)]));
    expect(out.weakSpots).toEqual([]);
    expect(out.retired).toEqual([]);
  });
});
