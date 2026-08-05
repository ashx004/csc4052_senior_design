// Recursive/boundary-aware chunking: tries paragraph breaks first, then
// sentence breaks, and only falls back to a hard character cut when a
// single paragraph/sentence exceeds the target size on its own — avoids
// blind fixed-size slicing cutting a sentence in half, which the old
// implementation could do. Chunks are packed greedily up to chunkSize, with
// the last `overlap` characters of each chunk carried into the start of the
// next so content sitting right on a boundary isn't lost to either side.
// Same signature as before — no caller changes needed.
const PARAGRAPH_SPLIT = /\n\s*\n+/;
const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z0-9"'])/;

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

export function chunkText(text: string, chunkSize = 1400, overlap = 150): string[] {
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
