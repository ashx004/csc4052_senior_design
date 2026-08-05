import { describe, expect, it } from "vitest";
import { chunkText } from "./chunking";

describe("chunkText", () => {
  it("returns an empty array for empty/whitespace-only input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("returns a single chunk when text fits within chunkSize", () => {
    const text = "This is a short paragraph.";
    expect(chunkText(text, 1400, 150)).toEqual([text]);
  });

  it("keeps every word intact when paragraph/sentence boundaries are available", () => {
    const text = "First paragraph here.\n\nSecond paragraph is short.";
    const chunks = chunkText(text, 40, 5);
    expect(chunks.length).toBeGreaterThan(1);
    for (const word of ["First", "paragraph", "Second", "short"]) {
      expect(chunks.some((c) => c.includes(word))).toBe(true);
    }
  });

  it("may split a word mid-token as a last resort when a piece has no paragraph/sentence boundary and exceeds chunkSize", () => {
    // One giant run-on "sentence" (no '.', '!', or '?') longer than chunkSize
    // forces splitOversized's hard-cut fallback — documented as a last
    // resort, so this pins down that documented tradeoff rather than
    // treating it as a bug.
    const wall = Array.from({ length: 10 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkText(wall, 20, 0);
    expect(chunks.join("")).toBe(wall);
  });

  it("never produces a chunk longer than chunkSize when a clean break exists", () => {
    const paragraph = "Sentence one is here. Sentence two follows it. Sentence three wraps up the thought.";
    const chunks = chunkText(paragraph, 30, 5);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(30);
    }
  });

  it("hard-cuts a single oversized token with no sentence boundary", () => {
    const wall = "a".repeat(100);
    const chunks = chunkText(wall, 30, 0);
    expect(chunks.join("")).toBe(wall);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(30);
    }
  });

  it("carries overlap from the end of one chunk into the start of the next", () => {
    const text = "Alpha Bravo Charlie Delta Echo\n\nFoxtrot Golf Hotel India Juliet\n\nKilo Lima Mike November Oscar";
    const chunks = chunkText(text, 50, 10);
    expect(chunks.length).toBeGreaterThan(1);
    const tailOfFirst = chunks[0].slice(-10);
    expect(chunks[1].startsWith(tailOfFirst)).toBe(true);
  });

  it("drops the overlap tail rather than exceeding chunkSize when the next piece alone leaves no room for it", () => {
    const paragraph = "AAAAAAAAAA BBBBBBBBBB CCCCCCCCCC DDDDDDDDDD";
    const chunks = chunkText(paragraph, 22, 10);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(22);
    }
  });
});
