// Recursive/boundary-aware chunking: tries paragraph breaks first, then
// sentence breaks, and only falls back to a hard character cut when a
// single paragraph/sentence exceeds the target size on its own — avoids
// blind fixed-size slicing cutting a sentence in half, which the old
// implementation could do. Chunks are packed greedily up to chunkSize, with
// the last `overlap` characters of each chunk carried into the start of the
// next so content sitting right on a boundary isn't lost to either side.
const PARAGRAPH_SPLIT = /\n\s*\n+/;
const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z0-9"'])/;

// Producers that know page boundaries (currently just pdfExtract.ts) embed
// this between pages so chunking can attribute each chunk back to a page
// for citations. Delimited with U+E000 (start of the Unicode Private Use
// Area, reserved for exactly this kind of private/internal sentinel use)
// rather than e.g. "\n\n---\n\n" because real extracted text can't contain
// it and, critically, it isn't matched by \s, so it survives the
// whitespace-collapse below instead of silently disappearing into a
// paragraph break. A plain NUL byte would work too but makes git (and some
// other tooling) treat the file as binary — this avoids that for free.
// Chunks never span a page boundary — the packer flushes at each marker —
// trading a little cross-page overlap for every chunk having one
// unambiguous page to cite.
export const PAGE_BREAK_MARKER = "PAGE_BREAK";

export type TextChunk = { text: string; page?: number };

function splitOversized(piece: string, chunkSize: number): string[] {
  if (piece.length <= chunkSize) return [piece];

  const sentences = piece.split(SENTENCE_SPLIT);
  if (sentences.length > 1) {
    return sentences.flatMap((s) => splitOversized(s, chunkSize));
  }

  // No sentence boundary to respect (e.g. a wall of code/text) — hard cut,
  // same as the old behavior, but only as a last resort.
  const parts: string[] = [];
  for (let i = 0; i < piece.length; i += chunkSize) {
    parts.push(piece.slice(i, i + chunkSize));
  }
  return parts;
}

function chunkSinglePage(text: string, chunkSize: number, overlap: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const paragraphs = trimmed
    .split(PARAGRAPH_SPLIT)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const pieces = paragraphs.flatMap((p) => splitOversized(p, chunkSize));

  const chunks: string[] = [];
  let current = "";

  for (const piece of pieces) {
    const candidate = current ? `${current}\n\n${piece}` : piece;
    if (candidate.length <= chunkSize) {
      current = candidate;
      continue;
    }

    chunks.push(current);
    const tail = current.slice(Math.max(0, current.length - overlap));
    const withTail = tail ? `${tail}\n\n${piece}` : piece;
    // splitOversized guarantees `piece` alone is <= chunkSize, but
    // tail + piece isn't checked — for a piece sized close to chunkSize,
    // carrying the overlap tail in front of it can push the result over
    // the limit. Drop the overlap for this boundary rather than violate
    // the chunkSize contract.
    current = withTail.length <= chunkSize ? withTail : piece;
  }

  if (current) chunks.push(current);
  return chunks;
}

// Same signature as before plus an optional `page` on each result — callers
// that don't care (or whose source has no page markers, e.g. docx/plain
// text) can keep destructuring just `.text`. When PAGE_BREAK_MARKER is
// present, each page is chunked independently (see the marker's comment
// above for why chunks don't span pages); when it isn't, this degrades to
// exactly the old single-pass behavior with `page` left undefined.
export function chunkText(text: string, chunkSize = 1400, overlap = 150): TextChunk[] {
  const pages = text.split(PAGE_BREAK_MARKER);
  if (pages.length === 1) {
    return chunkSinglePage(text, chunkSize, overlap).map((t) => ({ text: t }));
  }

  return pages.flatMap((pageText, i) =>
    chunkSinglePage(pageText, chunkSize, overlap).map((t) => ({ text: t, page: i + 1 }))
  );
}
