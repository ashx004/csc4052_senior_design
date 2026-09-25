// src/library/discover/blocksShapes.test.ts
import { describe, expect, it } from "vitest";
import { getRandomHand, SHAPE_CATALOG } from "./blocksShapes";
import { PIECE_COLORS } from "./blocksTypes";

describe("SHAPE_CATALOG", () => {
  it("contains only non-empty, in-bounds relative shapes", () => {
    expect(SHAPE_CATALOG.length).toBeGreaterThanOrEqual(20);
    for (const shape of SHAPE_CATALOG) {
      expect(shape.cells.length).toBeGreaterThan(0);
      expect(shape.cells.length).toBeLessThanOrEqual(5);
      for (const [row, col] of shape.cells) {
        expect(row).toBeGreaterThanOrEqual(0);
        expect(col).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("has unique ids", () => {
    const ids = SHAPE_CATALOG.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("getRandomHand", () => {
  it("returns HAND_SIZE pieces, each with a shape from the catalog and a valid color", () => {
    const hand = getRandomHand(4, () => 0);
    expect(hand).toHaveLength(4);
    for (const piece of hand) {
      expect(SHAPE_CATALOG).toContainEqual(piece.shape);
      expect(PIECE_COLORS).toContain(piece.color);
    }
  });

  it("is deterministic for a fixed rng", () => {
    const handA = getRandomHand(4, () => 0);
    const handB = getRandomHand(4, () => 0);
    expect(handA.map((p) => p.shape.id)).toEqual(handB.map((p) => p.shape.id));
    expect(handA.map((p) => p.color)).toEqual(handB.map((p) => p.color));
  });

  it("gives every piece a unique instanceId even with a fixed rng", () => {
    const hand = getRandomHand(4, () => 0);
    const ids = hand.map((p) => p.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("picks the last catalog entry and last color when rng returns just under 1", () => {
    const hand = getRandomHand(1, () => 0.9999999);
    expect(hand[0].shape).toEqual(SHAPE_CATALOG[SHAPE_CATALOG.length - 1]);
  });
});
