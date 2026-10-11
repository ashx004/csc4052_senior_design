// Display helpers for OCR transcripts. Pure, so they're unit-tested.

/** Handwritten lines end where the writer ended them, but Markdown joins
 *  single newlines into one paragraph. This keeps the line breaks (outside
 *  code fences) so a transcript reads like the page it came from. */
export function preserveLineBreaks(text: string): string {
  let inFence = false;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return lines
    .map((line, i) => {
      if (/^\s*```/.test(line)) inFence = !inFence;
      const next = lines[i + 1];
      if (inFence || next === undefined || !line.trim() || !next.trim()) return line;
      // Block constructs keep their own structure; only soft-wrap prose.
      if (/^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||\$\$|```)/.test(line) || /^\s*(\||\$\$|```)/.test(next)) return line;
      return `${line.replace(/\s+$/, "")}  `;
    })
    .join("\n");
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
