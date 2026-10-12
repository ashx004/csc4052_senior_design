import { describe, expect, it } from "vitest";
import { dedupeByEmbedding, normalizeForQuote, quoteIsGrounded, verifyGrounding, type GroundedItem } from "./verify";

const SOURCE = "A binary search tree keeps keys in sorted order.\nLookup costs O(log n) when balanced.";

describe("normalizeForQuote", () => {
  it("collapses runs of whitespace and trims", () => {
    expect(normalizeForQuote("  a\n\n  b \t c ")).toBe("a b c");
  });

  it("is case-insensitive", () => {
    expect(normalizeForQuote("ABC")).toBe(normalizeForQuote("abc"));
  });

  it("normalizes curly quotes and dashes the model may reformat", () => {
    expect(normalizeForQuote("“hi”—there")).toBe(normalizeForQuote('"hi"-there'));
  });

  // Review Focus (I2): the gate is now mandatory on PDF-extracted text, and
  // these artifacts are routine in a PDF's text layer.
  it("folds ligatures to their plain letters", () => {
    expect(normalizeForQuote("the \uFB01rst \uFB02ow")).toBe("the first flow");
  });

  it("drops soft hyphens and zero-width characters", () => {
    expect(normalizeForQuote("algo\u00ADrithm")).toBe("algorithm");
    expect(normalizeForQuote("bi\u200Bnary\u200Dsearch\uFEFF")).toBe("binarysearch");
  });

  it("rejoins a word broken across a line by a hyphen", () => {
    expect(normalizeForQuote("algo-\nrithm complexity")).toBe("algorithm complexity");
    expect(normalizeForQuote("algo\u2010\r\n   rithm complexity")).toBe("algorithm complexity");
  });

  it("keeps a hyphen that is not a line break", () => {
    expect(normalizeForQuote("red-black tree")).toBe("red-black tree");
    expect(normalizeForQuote("T- cell")).toBe("t- cell");
  });

  it("folds the ellipsis character, the minus sign and a non-breaking space", () => {
    expect(normalizeForQuote("a\u2026b")).toBe("a...b");
    expect(normalizeForQuote("O(n \u2212 1)")).toBe("o(n - 1)");
    expect(normalizeForQuote("a\u00A0b")).toBe("a b");
  });
});

describe("quoteIsGrounded", () => {
  it("accepts an exact quote", () => {
    expect(quoteIsGrounded("keeps keys in sorted order", SOURCE)).toBe(true);
  });

  // Review Focus 1: models reflow whitespace when quoting.
  it("accepts a quote whose whitespace was reflowed across a line break", () => {
    expect(quoteIsGrounded("sorted order.   Lookup costs", SOURCE)).toBe(true);
  });

  it("accepts a quote whose case differs", () => {
    expect(quoteIsGrounded("A BINARY SEARCH TREE", SOURCE)).toBe(true);
  });

  it("rejects an invented quote", () => {
    expect(quoteIsGrounded("red-black trees self-balance on insert", SOURCE)).toBe(false);
  });

  it("rejects a blank or missing quote", () => {
    expect(quoteIsGrounded("", SOURCE)).toBe(false);
    expect(quoteIsGrounded("   ", SOURCE)).toBe(false);
  });

  it("rejects a quote that is too short to be evidence", () => {
    expect(quoteIsGrounded("a", SOURCE)).toBe(false);
  });

  // A PDF page carrying these artifacts must not silently shorten a set:
  // the quote reads the same to the student, so it has to be accepted.
  it("accepts a clean quote of PDF text that holds a ligature", () => {
    const pdf = "The \uFB01rst traversal visits every node exactly once.";
    expect(quoteIsGrounded("the first traversal visits every node", pdf)).toBe(true);
  });

  it("accepts a quote of a word a PDF broke with a soft hyphen", () => {
    const pdf = "An algo\u00ADrithm analysis measures growth, not seconds.";
    expect(quoteIsGrounded("an algorithm analysis measures growth", pdf)).toBe(true);
  });

  it("accepts a quote of a word a PDF broke across a line", () => {
    const pdf = "An algo-\nrithm analysis measures growth, not seconds.";
    expect(quoteIsGrounded("an algorithm analysis measures growth", pdf)).toBe(true);
  });

  it("accepts a quote whose zero-width space the extractor left behind", () => {
    expect(quoteIsGrounded("keeps keys\u200B in sorted order", SOURCE)).toBe(true);
  });

  it("accepts a quote written with the minus sign for a hyphen", () => {
    const pdf = "Balanced lookup costs O(log n - 1) comparisons overall.";
    expect(quoteIsGrounded("costs O(log n \u2212 1) comparisons", pdf)).toBe(true);
  });

  // The guard on the hardening above: folding invisible characters must not
  // make an ungrounded quote pass. A false accept ships a fabricated
  // question as grounded, which is the failure this gate exists to stop.
  it("still rejects an invented quote after the PDF hardening", () => {
    const pdf = "An algo-\nrithm analysis measures growth, not seconds.";
    expect(quoteIsGrounded("an algorithm analysis measures wall clock seconds", pdf)).toBe(false);
    // Words of the source, reordered: not a quote of it.
    expect(quoteIsGrounded("measures growth an algorithm analysis", pdf)).toBe(false);
    // An elision is not a wildcard.
    expect(quoteIsGrounded("an algorithm analysis \u2026 seconds", pdf)).toBe(false);
    // Removing the invisible characters must not also remove visible ones.
    expect(quoteIsGrounded("keeps keys in order when balanced", SOURCE)).toBe(false);
  });
});

describe("verifyGrounding", () => {
  it("keeps grounded items and rejects ungrounded ones", () => {
    const items = [
      { question: "Q1", sourceQuote: "keeps keys in sorted order" },
      { question: "Q2", sourceQuote: "quantum entanglement of trees" },
    ];
    const { kept, rejected } = verifyGrounding(items, SOURCE);
    expect(kept.map((i) => i.question)).toEqual(["Q1"]);
    expect(rejected.map((i) => i.question)).toEqual(["Q2"]);
  });

  it("rejects an item with no quote at all", () => {
    const { kept, rejected } = verifyGrounding([{ question: "Q", sourceQuote: undefined }], SOURCE);
    expect(kept).toHaveLength(0);
    expect(rejected).toHaveLength(1);
  });

  it("rejects an item whose sourceQuote key is absent at runtime", () => {
    // A model can omit the field entirely; the cast mimics that without
    // widening GroundedItem, which would let a misnamed quote field compile.
    const items = [{ question: "Q" } as GroundedItem];
    const { kept, rejected } = verifyGrounding(items, SOURCE);
    expect(kept).toHaveLength(0);
    expect(rejected).toHaveLength(1);
  });

  it("returns empty lists for no items", () => {
    expect(verifyGrounding([], SOURCE)).toEqual({ kept: [], rejected: [] });
  });
});

describe("dedupeByEmbedding", () => {
  it("drops a near-duplicate and keeps the first", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const vectors = [[1, 0], [1, 0.001], [0, 1]];
    expect(dedupeByEmbedding(items, vectors).map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("keeps everything when nothing is similar", () => {
    expect(dedupeByEmbedding([{ id: "a" }, { id: "b" }], [[1, 0], [0, 1]])).toHaveLength(2);
  });

  it("keeps everything when the vector count does not match the item count", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    // Two vectors for three items. The two are identical, so without the
    // length guard the second item would be dropped as a duplicate — which
    // is exactly the silent shrinking the guard exists to prevent.
    expect(dedupeByEmbedding(items, [[1, 0], [1, 0]])).toEqual(items);
    expect(dedupeByEmbedding([{ id: "a" }, { id: "b" }], [])).toHaveLength(2);
  });
});
