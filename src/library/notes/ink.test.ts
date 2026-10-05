import { describe, expect, it } from "vitest";
import { inkBottom, strokeHit, strokesTouchedBy, thinPoints } from "./ink";
import type { InkStroke } from "./types";

const line = (id: string, points: number[], width = 2): InkStroke => ({ id, tool: "pencil", color: "ink", width, points });

describe("strokeHit", () => {
  const s = line("a", [0, 0, 100, 0]);
  it("hits near the line and misses far from it", () => {
    expect(strokeHit(s, 50, 3, 4)).toBe(true);
    expect(strokeHit(s, 50, 20, 4)).toBe(false);
  });
  it("counts the stroke's own width", () => {
    expect(strokeHit(line("w", [0, 0, 100, 0], 20), 50, 12, 4)).toBe(true);
  });
  it("handles a single dot", () => {
    expect(strokeHit(line("d", [10, 10]), 12, 11, 4)).toBe(true);
  });
});

describe("strokesTouchedBy", () => {
  it("erases every whole stroke the eraser path crosses, and only those", () => {
    const strokes = [line("top", [0, 0, 100, 0]), line("bottom", [0, 100, 100, 100])];
    expect([...strokesTouchedBy(strokes, [50, -50, 50, 2], 5)]).toEqual(["top"]);
  });
});

describe("thinPoints", () => {
  it("drops near-duplicate points but always keeps the endpoints", () => {
    expect(thinPoints([0, 0, 0.5, 0, 1, 0, 3, 0, 3.2, 0], 1.5)).toEqual([0, 0, 3, 0, 3.2, 0]);
  });
  it("rounds to a tenth of a pixel", () => {
    expect(thinPoints([1.234, 5.678])).toEqual([1.2, 5.7]);
  });
});

describe("inkBottom", () => {
  it("finds the lowest drawn point including stroke width", () => {
    expect(inkBottom([line("a", [0, 10, 5, 300], 4), line("b", [0, 50])])).toBe(302);
  });
});
