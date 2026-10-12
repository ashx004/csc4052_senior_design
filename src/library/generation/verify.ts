// Grounding checks for generated study items.
//
// The quote check is deterministic and costs nothing: every generated item
// must carry a verbatim quote from the text that was sent for its source,
// and an item whose quote is not actually there is thrown away. This kills
// a large class of fabrication without a second model call.
//
// Matching normalizes first. A model reliably reflows whitespace, changes
// case and swaps straight quotes for curly ones when quoting, so a raw
// `includes()` would reject correct quotes and silently discard good
// questions — a worse failure than the one it is trying to prevent.

import { cosine } from "./selectChunks";

/** Question embeddings closer than this are treated as the same question. */
export const DUPLICATE_THRESHOLD = 0.95;

/** Shortest quote that counts as evidence; below this a match is coincidence. */
const MIN_QUOTE_CHARS = 12;

export type GroundedItem = { sourceQuote?: string };

/**
 * Folds away differences that are invisible to the student, and nothing more.
 *
 * PDF text layers, not the model, are the main source of noise here: a
 * PDF-extracted page routinely carries ligatures (ﬁ, ﬂ), soft hyphens,
 * zero-width joiners, non-breaking spaces, the ellipsis character, a minus
 * sign standing in for a hyphen, and words broken across a line with a
 * trailing hyphen. A quote that reads identically on the page must match.
 *
 * NFKC runs first because it already folds ligatures, the ellipsis
 * character and non-breaking spaces. The replacements after it cover what
 * NFKC deliberately leaves alone - curly quotes, the dash family, U+2212,
 * soft hyphens and zero-width characters - and the whitespace collapse is
 * last so every earlier step can still see line breaks.
 *
 * Where the line is drawn: every transformation below either deletes a
 * character that renders as nothing, or maps a typographic variant onto the
 * one glyph it is drawn as. Nothing here drops a word, removes meaningful
 * punctuation, or treats an elision ("...") as a wildcard. Those would buy
 * a few more accepted quotes at the cost of false accepts, and a false
 * accept ships a fabricated question as grounded - worse than a thin set.
 */
export function normalizeForQuote(text: string): string {
  return text
    .normalize("NFKC")
    // Renders as nothing: the soft hyphen and the zero-width family.
    // Written as alternation rather than one class: a character class
    // holding the zero-width joiners reads as a single joined sequence.
    .replace(/\u00AD|\u200B|\u200C|\u200D|\u2060|\uFEFF/g, "")
    // A word broken across a line keeps its hyphen in the extracted text.
    // Only a true hyphen immediately before a line break counts; an en or em
    // dash at the end of a line joins nothing, and a hyphen followed by a
    // plain space is a real hyphen ("T- cell") rather than a line break.
    .replace(/[-\u2010][ \t]*\r?\n[ \t]*/g, "")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    // The dash block (U+2010-U+2015) plus the minus sign, which NFKC keeps.
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function quoteIsGrounded(quote: string, sourceText: string): boolean {
  if (!quote) return false;
  const needle = normalizeForQuote(quote);
  if (needle.length < MIN_QUOTE_CHARS) return false;
  return normalizeForQuote(sourceText).includes(needle);
}

export function verifyGrounding<T extends GroundedItem>(
  items: T[],
  sourceText: string
): { kept: T[]; rejected: T[] } {
  const kept: T[] = [];
  const rejected: T[] = [];
  for (const item of items) {
    if (quoteIsGrounded(item.sourceQuote ?? "", sourceText)) kept.push(item);
    else rejected.push(item);
  }
  return { kept, rejected };
}

/**
 * Overlapping lectures produce the same question twice. Compares question
 * embeddings and keeps the first of each near-duplicate pair. Missing or
 * mismatched vectors mean "cannot tell", so nothing is dropped.
 */
export function dedupeByEmbedding<T>(items: T[], vectors: number[][], threshold = DUPLICATE_THRESHOLD): T[] {
  if (vectors.length !== items.length) return items;
  const kept: T[] = [];
  const keptVectors: number[][] = [];
  for (let i = 0; i < items.length; i++) {
    const vector = vectors[i];
    const duplicate = vector?.length
      ? keptVectors.some((other) => cosine(vector, other) >= threshold)
      : false;
    if (duplicate) continue;
    kept.push(items[i]);
    if (vector?.length) keptVectors.push(vector);
  }
  return kept;
}
