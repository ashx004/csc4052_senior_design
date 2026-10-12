import { describe, expect, it } from "vitest";
import { allocateQuotas, PER_SOURCE_FLOOR } from "./allocateQuotas";

const src = (id: string, textLength: number) => ({ id, textLength });

describe("allocateQuotas", () => {
  it("gives everything to a single source", () => {
    expect(allocateQuotas([src("a", 1000)], 30)).toEqual([30]);
  });

  it("sums exactly to the requested count", () => {
    const quotas = allocateQuotas([src("a", 900), src("b", 600), src("c", 300)], 31);
    expect(quotas.reduce((a, b) => a + b, 0)).toBe(31);
  });

  it("splits proportionally to text volume above the floor", () => {
    // 3 sources, floor 4 each = 12; 12 remaining split 3:2:1 by volume.
    const quotas = allocateQuotas([src("a", 3000), src("b", 2000), src("c", 1000)], 24);
    expect(quotas).toEqual([10, 8, 6]);
  });

  it("never drops a source below the floor even when its text is tiny", () => {
    const quotas = allocateQuotas([src("a", 100000), src("b", 1)], 30);
    expect(quotas[1]).toBeGreaterThanOrEqual(PER_SOURCE_FLOOR);
    expect(quotas.reduce((a, b) => a + b, 0)).toBe(30);
  });

  it("gives equal quotas when volumes are equal", () => {
    expect(allocateQuotas([src("a", 500), src("b", 500)], 20)).toEqual([10, 10]);
  });

  // Review Focus 3: a count too small for the floor degrades it rather than
  // refusing. A thinner set still teaches; a hard failure teaches nothing, and
  // a 1-3 question quiz and a 10-note notebook both have to work.
  it("degrades the floor for a count that cannot give every source four", () => {
    const quotas = allocateQuotas([src("a", 10), src("b", 10), src("c", 10)], 5);
    expect(quotas.reduce((a, b) => a + b, 0)).toBe(5);
    expect(quotas.every((q) => q >= 1)).toBe(true);
  });

  // One item per source is the real hard minimum: below it some source would
  // be invisible however the remainder is split.
  it("rejects a count below one item per source", () => {
    expect(() => allocateQuotas([src("a", 10), src("b", 10), src("c", 10)], 2)).toThrow(
      "needs at least 3 items for 3 sources"
    );
  });

  // The three properties the degrading floor must not break, over every
  // source count and every valid item count the routes can produce.
  it("always sums to the count, never gives a source zero, and honors the floor when it fits", () => {
    for (let n = 1; n <= 10; n++) {
      const sources = Array.from({ length: n }, (_, i) => src(`s${i}`, (i % 4) * 1000));
      for (let count = n; count <= 60; count++) {
        const quotas = allocateQuotas(sources, count);
        expect(quotas).toHaveLength(n);
        expect(quotas.reduce((a, b) => a + b, 0)).toBe(count);
        expect(Math.min(...quotas)).toBeGreaterThanOrEqual(1);
        if (count >= n * PER_SOURCE_FLOOR) {
          expect(Math.min(...quotas)).toBeGreaterThanOrEqual(PER_SOURCE_FLOOR);
        }
      }
    }
  });

  it("allows exactly the minimum count", () => {
    expect(allocateQuotas([src("a", 10), src("b", 10)], 8)).toEqual([4, 4]);
  });

  it("treats a zero-length source as its floor without dividing by zero", () => {
    const quotas = allocateQuotas([src("a", 0), src("b", 0)], 10);
    expect(quotas.reduce((a, b) => a + b, 0)).toBe(10);
    expect(quotas.every((q) => q >= PER_SOURCE_FLOOR)).toBe(true);
  });

  it("moves a weighted source's share up without starving the others", () => {
    const even = allocateQuotas([src("a", 1000), src("b", 1000)], 30);
    const weighted = allocateQuotas([src("a", 1000), src("b", 1000)], 30, { a: 1.5 });
    expect(weighted[0]).toBeGreaterThan(even[0]);
    expect(weighted[1]).toBeGreaterThanOrEqual(PER_SOURCE_FLOOR);
    expect(weighted.reduce((a, b) => a + b, 0)).toBe(30);
  });

  it("ignores weights for sources it does not name", () => {
    expect(allocateQuotas([src("a", 1000), src("b", 1000)], 20, { zzz: 2 })).toEqual([10, 10]);
  });

  it("caps a weight's effect at +/-50 percent of the proportional share", () => {
    const weighted = allocateQuotas([src("a", 1000), src("b", 1000)], 40, { a: 100 });
    // Proportional share is 20; +50% caps it at 30.
    expect(weighted[0]).toBeLessThanOrEqual(30);
  });

  it("rejects a non-integer or non-positive count", () => {
    expect(() => allocateQuotas([src("a", 10)], 0)).toThrow("Choose");
    expect(() => allocateQuotas([src("a", 10)], 2.5)).toThrow("Choose");
  });

  it("rejects an empty source list", () => {
    expect(() => allocateQuotas([], 10)).toThrow("Choose at least one");
  });
});
