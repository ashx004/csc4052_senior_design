import { describe, expect, it } from "vitest";
import { chunkText, PAGE_BREAK_MARKER } from "./chunking";

function texts(text: string, chunkSize?: number, overlap?: number): string[] {
  return chunkText(text, chunkSize, overlap).map((c) => c.text);
}

describe("chunkText", () => {
  it("returns an empty array for empty/whitespace-only input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("returns a single chunk when text fits within chunkSize", () => {
    const text = "This is a short paragraph.";
    expect(texts(text, 1400, 150)).toEqual([text]);
  });

  it("keeps every word intact when paragraph/sentence boundaries are available", () => {
    const text = "First paragraph here.\n\nSecond paragraph is short.";
    const chunks = texts(text, 40, 5);
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
    const chunks = texts(wall, 20, 0);
    expect(chunks.join("")).toBe(wall);
  });

  it("never produces a chunk longer than chunkSize when a clean break exists", () => {
    const paragraph = "Sentence one is here. Sentence two follows it. Sentence three wraps up the thought.";
    const chunks = texts(paragraph, 30, 5);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(30);
    }
  });

  it("hard-cuts a single oversized token with no sentence boundary", () => {
    const wall = "a".repeat(100);
    const chunks = texts(wall, 30, 0);
    expect(chunks.join("")).toBe(wall);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(30);
    }
  });

  it("carries overlap from the end of one chunk into the start of the next", () => {
    const text = "Alpha Bravo Charlie Delta Echo\n\nFoxtrot Golf Hotel India Juliet\n\nKilo Lima Mike November Oscar";
    const chunks = texts(text, 50, 10);
    expect(chunks.length).toBeGreaterThan(1);
    const tailOfFirst = chunks[0].slice(-10);
    expect(chunks[1].startsWith(tailOfFirst)).toBe(true);
  });

  it("drops the overlap tail rather than exceeding chunkSize when the next piece alone leaves no room for it", () => {
    const paragraph = "AAAAAAAAAA BBBBBBBBBB CCCCCCCCCC DDDDDDDDDD";
    const chunks = texts(paragraph, 22, 10);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(22);
    }
  });

  it("leaves page undefined when the source has no page markers", () => {
    const chunks = chunkText("This is a short paragraph.", 1400, 150);
    expect(chunks[0].page).toBeUndefined();
  });

  it("attributes each chunk to its page when PAGE_BREAK_MARKER is present", () => {
    const text = `Page one content here.${PAGE_BREAK_MARKER}Page two content here.${PAGE_BREAK_MARKER}Page three content here.`;
    const chunks = chunkText(text, 1400, 150);
    expect(chunks.map((c) => c.page)).toEqual([1, 2, 3]);
    expect(chunks[0].text).toContain("Page one");
    expect(chunks[1].text).toContain("Page two");
    expect(chunks[2].text).toContain("Page three");
  });

  it("never lets a chunk span two pages, even when a page's content is small", () => {
    const text = `Short.${PAGE_BREAK_MARKER}Also short.`;
    const chunks = chunkText(text, 1400, 150);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].page).toBe(1);
    expect(chunks[1].page).toBe(2);
  });
});
