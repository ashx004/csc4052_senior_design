// Simple fixed-size character chunking with overlap — good enough for
// RAG-over-course-PDFs at this app's scale, no token-aware splitting needed.
export function chunkText(text: string, chunkSize = 1400, overlap = 150): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < clean.length) {
    const end = Math.min(start + chunkSize, clean.length);
    chunks.push(clean.slice(start, end));
    if (end === clean.length) break;
    start = end - overlap;
  }

  return chunks;
}
