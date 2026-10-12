import { describe, expect, it } from "vitest";
import { cosine, selectChunks } from "./selectChunks";

const chunk = (text: string, score: number, vector?: number[], page?: number) => ({ text, score, vector, page });

describe("cosine", () => {
  it("is 1 for identical vectors and 0 for orthogonal ones", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("is 0 when either vector is zero-length, instead of NaN", () => {
    expect(cosine([0, 0], [1, 0])).toBe(0);
    expect(cosine([], [])).toBe(0);
  });
});

describe("selectChunks", () => {
  it("returns nothing for no candidates", () => {
    expect(selectChunks([], 1000)).toEqual([]);
  });

  it("keeps everything that fits in the budget", () => {
    const all = [chunk("aaa", 0.9), chunk("bbb", 0.8)];
    expect(selectChunks(all, 1000)).toHaveLength(2);
  });

  it("stops at the character budget", () => {
    const all = [chunk("a".repeat(60), 0.9), chunk("b".repeat(60), 0.8), chunk("c".repeat(60), 0.7)];
    const picked = selectChunks(all, 130);
    expect(picked).toHaveLength(2);
    expect(picked.reduce((n, c) => n + c.text.length, 0)).toBeLessThanOrEqual(130);
  });

  it("takes the highest-scoring chunk first", () => {
    const picked = selectChunks([chunk("low", 0.1), chunk("high", 0.9)], 4);
    expect(picked[0].text).toBe("high");
  });

  it("prefers a different chunk over one near-identical to what is already picked", () => {
    const picked = selectChunks(
      [
        chunk("first", 0.90, [1, 0]),
        chunk("dupe-", 0.89, [1, 0]), // nearly identical direction to the first
        chunk("other", 0.50, [0, 1]), // lower score but new information
      ],
      10
    );
    expect(picked.map((c) => c.text)).toEqual(["first", "other"]);
  });

  it("falls back to score order when no vectors are present", () => {
    const picked = selectChunks([chunk("c", 0.3), chunk("a", 0.9), chunk("b", 0.6)], 3);
    expect(picked.map((c) => c.text)).toEqual(["a", "b", "c"]);
  });

  it("skips blank chunks", () => {
    expect(selectChunks([chunk("   ", 0.9), chunk("real", 0.1)], 100).map((c) => c.text)).toEqual(["real"]);
  });

  it("carries the page through", () => {
    expect(selectChunks([chunk("text", 0.9, undefined, 7)], 100)[0].page).toBe(7);
  });

  it("never returns the same chunk twice", () => {
    const picked = selectChunks([chunk("same", 0.9, [1, 0]), chunk("same", 0.9, [1, 0])], 100);
    expect(picked).toHaveLength(1);
  });
});
