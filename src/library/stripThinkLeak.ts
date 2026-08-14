// qwen3:30b-a3b (the "quality" chat model, see chatMode.ts) has a known bug:
// even with think:false, it sometimes still emits its raw chain-of-thought
// as plain content, ending in a stray closing </think> tag with no matching
// opening tag - confirmed live, reproduced 4/4 tries during model research.
// For non-streaming JSON-schema-constrained routes (flashcards, quiz), this
// isn't just cosmetic: a leaked reasoning prefix breaks JSON.parse outright,
// since the response is no longer valid JSON on its own. Safe to call
// unconditionally regardless of which model produced the content - a
// response that never leaked just passes through unchanged.
export const THINK_CLOSE_TAG = "</think>";

export function stripThinkLeak(content: string): string {
  const idx = content.indexOf(THINK_CLOSE_TAG);
  if (idx === -1) return content;
  return content.slice(idx + THINK_CLOSE_TAG.length).trim();
}
