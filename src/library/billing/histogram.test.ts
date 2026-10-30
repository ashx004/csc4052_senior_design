import { describe, expect, it } from "vitest";
import { DURATION_EDGES_MS, mergeHistograms, percentileAboveFromHistogram, percentileFromHistogram, toHistogram } from "./histogram";

describe("toHistogram", () => {
  it("counts each value into the first bucket whose edge it does not exceed", () => {
    expect(toHistogram([50, 150, 150, 99999], DURATION_EDGES_MS).slice(0, 2)).toEqual([1, 2]);
    expect(toHistogram([50, 150, 150, 99999], DURATION_EDGES_MS).at(-1)).toBe(1);
  });
  it("returns an all-zero histogram of the right length for no values", () => {
    expect(toHistogram([], DURATION_EDGES_MS)).toHaveLength(DURATION_EDGES_MS.length);
    expect(toHistogram([], DURATION_EDGES_MS).every((n) => n === 0)).toBe(true);
  });
});

describe("mergeHistograms", () => {
  it("adds counts element-wise", () => {
    expect(mergeHistograms([1, 2, 0], [0, 3, 4])).toEqual([1, 5, 4]);
  });
  it("throws when the lengths differ", () => {
    expect(() => mergeHistograms([1, 2], [1, 2, 3])).toThrow();
  });
});

describe("percentileFromHistogram", () => {
  it("returns null below 5 counted values, matching the exact path", () => {
    expect(percentileFromHistogram(toHistogram([1, 2, 3, 4], DURATION_EDGES_MS), DURATION_EDGES_MS, 0.5)).toBeNull();
  });
  it("returns the upper edge of the bucket holding the nearest-rank value", () => {
    // ten values, all in the 100-200ms bucket -> p50 and p95 are that bucket's edge
    const h = toHistogram([110, 120, 130, 140, 150, 160, 170, 180, 190, 199], DURATION_EDGES_MS);
    expect(percentileFromHistogram(h, DURATION_EDGES_MS, 0.5)).toBe(200);
    expect(percentileFromHistogram(h, DURATION_EDGES_MS, 0.95)).toBe(200);
  });
  it("separates a low median from a high tail", () => {
    const h = toHistogram([...Array(18).fill(150), 50000, 50000], DURATION_EDGES_MS);
    expect(percentileFromHistogram(h, DURATION_EDGES_MS, 0.5)).toBe(200);
    expect(percentileFromHistogram(h, DURATION_EDGES_MS, 0.95)).toBe(60000);
  });
  it("returns null when the last bucket is Infinity and holds the answer", () => {
    const h = toHistogram(Array(10).fill(500000), DURATION_EDGES_MS);
    expect(percentileFromHistogram(h, DURATION_EDGES_MS, 0.95)).toBeNull();
  });
});

describe("percentileAboveFromHistogram", () => {
  it("names the last finite edge when the nearest-rank value is in the open-topped bucket", () => {
    const h = toHistogram([...Array(18).fill(150), 500000, 500000], DURATION_EDGES_MS);
    expect(percentileAboveFromHistogram(h, DURATION_EDGES_MS, 0.95)).toBe(90000);
    expect(percentileFromHistogram(h, DURATION_EDGES_MS, 0.95)).toBeNull();
    // The median is in a finite bucket, so it has an edge of its own and nothing to report here.
    expect(percentileAboveFromHistogram(h, DURATION_EDGES_MS, 0.5)).toBeNull();
    expect(percentileFromHistogram(h, DURATION_EDGES_MS, 0.5)).toBe(200);
  });
  it("is null below 5 counted values, even when they all sit in the open-topped bucket", () => {
    expect(percentileAboveFromHistogram(toHistogram(Array(4).fill(500000), DURATION_EDGES_MS), DURATION_EDGES_MS, 0.95)).toBeNull();
    expect(percentileAboveFromHistogram(toHistogram(Array(5).fill(500000), DURATION_EDGES_MS), DURATION_EDGES_MS, 0.5)).toBe(90000);
  });
  it("is null for an empty histogram", () => {
    expect(percentileAboveFromHistogram(toHistogram([], DURATION_EDGES_MS), DURATION_EDGES_MS, 0.95)).toBeNull();
  });
});
