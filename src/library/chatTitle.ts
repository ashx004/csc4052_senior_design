// Zero-latency title: truncate the opening message at a word boundary rather
// than spending an extra model round-trip on naming a chat. Pulled out of
// chatMemory.ts so server-side API routes can reuse it without importing the
// client Firebase SDK that chatMemory.ts depends on.
export function deriveChatTitle(firstMessage: string): string {
  const clean = firstMessage.trim().replace(/\s+/g, " ");
  if (clean.length <= 48) return clean;
  const truncated = clean.slice(0, 48);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + "…";
}
