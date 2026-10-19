// When a chat's older messages get folded into a running summary
// (compactIfNeeded in api/chat/route.ts). Shared with the browser so the
// chat's memory meter fills up at exactly the point the server compacts.

/** Characters of not-yet-summarized messages that trigger a summary. */
export const COMPACTION_CHAR_THRESHOLD = 45_000;
/** Messages kept word for word when the automatic summary runs. */
export const KEEP_RECENT_MESSAGES = 10;
/** Messages kept word for word when the student runs /compact. */
export const COMPACT_NOW_KEEP_MESSAGES = 4;

/** How full the chat's memory is, 0 to 1: 1 means the next message triggers a summary. */
export function memoryFill(messages: { text?: string; content?: string }[], summarizedCount: number): number {
  const chars = messages.slice(summarizedCount).reduce((sum, m) => sum + (m.text ?? m.content ?? "").length, 0);
  return Math.min(1, chars / COMPACTION_CHAR_THRESHOLD);
}
