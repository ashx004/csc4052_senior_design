import { describe, expect, it } from "vitest";
import {
  buildCategorizeRound,
  buildMatchRound,
  buildSequenceRound,
  formatClock,
  isComplete,
  placeTile,
  roundPoints,
  scorePlacement,
  secondsRemaining,
  shuffled,
  timeLimitFor,
  unplacedTiles,
} from "./dragDrop";

// A deterministic "random" so shuffles are repeatable.
function seeded(seed = 7) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const base = { instructions: "", explanation: "Because." };

describe("shuffled", () => {
  it("keeps every item and does not change the input", () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffled(input, seeded());
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("buildMatchRound", () => {
  const pairs = [
    { left: "Mitochondria", right: "Makes ATP" },
    { left: "Ribosome", right: "Builds proteins" },
    { left: "Nucleus", right: "Holds DNA" },
    { left: "Golgi", right: "Packages proteins" },
  ];

  it("builds a tile and a zone per pair with a correct answer key", () => {
    const round = buildMatchRound({ ...base, pairs }, "r1", seeded())!;
    expect(round.mode).toBe("match");
    expect(round.tiles).toHaveLength(4);
    expect(round.zones).toHaveLength(4);
    for (const tile of round.tiles) {
      const zone = round.zones.find((z) => z.id === round.solution[tile.id])!;
      const pair = pairs.find((p) => p.left === tile.label)!;
      expect(zone.label).toBe(pair.right);
    }
  });

  it("never hands the tiles over already in answer order", () => {
    const round = buildMatchRound({ ...base, pairs }, "r1", () => 0)!;
    expect(round.tiles.map((t) => t.label)).not.toEqual(pairs.map((p) => p.left));
  });

  it("drops duplicate or blank pairs and rejects rounds that end up too small", () => {
    expect(buildMatchRound({ ...base, pairs: [...pairs, { left: "mitochondria", right: "Other" }, { left: "", right: "x" }] }, "r", seeded())!.tiles).toHaveLength(4);
    expect(buildMatchRound({ ...base, pairs: pairs.slice(0, 2) }, "r")).toBeNull();
    expect(buildMatchRound({ ...base, pairs: Array.from({ length: 11 }, (_, i) => ({ left: `a${i}`, right: `b${i}` })) }, "r")).toBeNull();
  });

  it("gives a default instruction and scales the time limit with size", () => {
    const round = buildMatchRound({ ...base, pairs }, "r1", seeded())!;
    expect(round.instructions).toMatch(/drag/i);
    expect(round.timeLimitSeconds).toBe(timeLimitFor("match", 4));
  });
});

describe("buildCategorizeRound", () => {
  const categories = [
    { name: "Prokaryote", items: ["Bacteria", "No nucleus"] },
    { name: "Eukaryote", items: ["Plants", "Has a nucleus", "Animals"] },
  ];
  it("builds one tile per item and one zone per category", () => {
    const round = buildCategorizeRound({ ...base, categories }, "r", seeded())!;
    expect(round.tiles).toHaveLength(5);
    expect(round.zones.map((z) => z.label)).toEqual(["Prokaryote", "Eukaryote"]);
    const bacteria = round.tiles.find((t) => t.label === "Bacteria")!;
    expect(round.zones.find((z) => z.id === round.solution[bacteria.id])!.label).toBe("Prokaryote");
  });
  it("rejects one category, lopsided single-item categories and duplicated items", () => {
    expect(buildCategorizeRound({ ...base, categories: [categories[0]] }, "r")).toBeNull();
    expect(buildCategorizeRound({ ...base, categories: [{ name: "A", items: ["x"] }, { name: "B", items: ["y", "z", "w"] }] }, "r")).toBeNull();
    const dup = buildCategorizeRound({ ...base, categories: [{ name: "A", items: ["x", "y"] }, { name: "B", items: ["X", "z", "w"] }] }, "r", seeded())!;
    expect(dup.tiles).toHaveLength(4); // the second "x" is dropped
  });
});

describe("buildSequenceRound", () => {
  const steps = ["Transcription", "RNA processing", "Translation", "Folding"];
  it("makes numbered slots and a shuffled set of steps", () => {
    const round = buildSequenceRound({ ...base, steps }, "r", seeded())!;
    expect(round.zones.map((z) => z.label)).toEqual(["1st", "2nd", "3rd", "4th"]);
    expect(round.tiles.map((t) => t.label)).not.toEqual(steps);
    const first = round.tiles.find((t) => t.label === "Transcription")!;
    expect(round.solution[first.id]).toBe("z0");
  });
  it("rejects too few or too many steps", () => {
    expect(buildSequenceRound({ ...base, steps: ["a", "b"] }, "r")).toBeNull();
    expect(buildSequenceRound({ ...base, steps: Array.from({ length: 9 }, (_, i) => `s${i}`) }, "r")).toBeNull();
  });
});

describe("placeTile", () => {
  const match = { mode: "match" as const };
  it("moves a tile between zones and back to the tray", () => {
    let p = placeTile(match, {}, "t1", "z1");
    expect(p).toEqual({ t1: "z1" });
    p = placeTile(match, p, "t1", "z2");
    expect(p).toEqual({ t1: "z2" });
    expect(placeTile(match, p, "t1", null)).toEqual({});
  });
  it("sends the previous occupant of a single-tile zone back to the tray", () => {
    const p = placeTile(match, { t1: "z1" }, "t2", "z1");
    expect(p).toEqual({ t2: "z1" });
  });
  it("lets a category hold many tiles", () => {
    const p = placeTile({ mode: "categorize" }, { t1: "z1" }, "t2", "z1");
    expect(p).toEqual({ t1: "z1", t2: "z1" });
  });
});

describe("scoring", () => {
  const item = {
    tiles: [{ id: "t0", label: "a" }, { id: "t1", label: "b" }, { id: "t2", label: "c" }, { id: "t3", label: "d" }],
    solution: { t0: "z0", t1: "z1", t2: "z2", t3: "z3" },
  };
  it("gives partial credit and counts unplaced tiles as wrong", () => {
    expect(scorePlacement(item, { t0: "z0", t1: "z1", t2: "z2", t3: "z3" })).toBe(1);
    expect(scorePlacement(item, { t0: "z0", t1: "z1", t2: "z3" })).toBe(0.5);
    expect(scorePlacement(item, {})).toBe(0);
    expect(scorePlacement({ tiles: [], solution: {} }, {})).toBe(0);
  });
  it("tracks what is left on the tray", () => {
    expect(unplacedTiles(item, { t0: "z0" }).map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    expect(isComplete(item, { t0: "z0", t1: "z1", t2: "z2", t3: "z3" })).toBe(true);
    expect(isComplete(item, { t0: "z0" })).toBe(false);
  });
  it("awards the time bonus only for a perfect round", () => {
    expect(roundPoints(1, 30, 60)).toBe(125);
    expect(roundPoints(1, 0, 60)).toBe(100);
    expect(roundPoints(0.5, 60, 60)).toBe(50);
    expect(roundPoints(1, 999, 60)).toBe(150);
    expect(roundPoints(1, 10, 0)).toBe(100);
  });
});

describe("the clock", () => {
  it("counts down in whole seconds and stops at zero", () => {
    expect(secondsRemaining(1000, 60, 1000)).toBe(60);
    expect(secondsRemaining(1000, 60, 1500)).toBe(60);
    expect(secondsRemaining(1000, 60, 1001 + 1000)).toBe(59);
    expect(secondsRemaining(1000, 60, 61_000)).toBe(0);
    expect(secondsRemaining(1000, 60, 99_000)).toBe(0);
  });
  it("formats minutes and seconds", () => {
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(-3)).toBe("0:00");
  });
  it("limits grow with the round but are capped", () => {
    expect(timeLimitFor("match", 3)).toBe(44);
    expect(timeLimitFor("sequence", 5)).toBe(70);
    expect(timeLimitFor("match", 100)).toBe(180);
  });
});
