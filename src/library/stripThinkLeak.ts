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

// A model can occasionally append trailing content after an otherwise-valid
// JSON object — extra commentary, a stray repeated fragment, markdown
// fencing — which breaks a strict JSON.parse even though the real JSON
// underneath is completely fine. Confirmed live 2026-08-14: a document with
// heavy mathematical notation (Θ-notation, exponents/subscripts) reliably —
// at temperature 0, so deterministically — triggered this exact failure on
// the quiz/flashcard generation model, at nearly identical character
// positions across repeated attempts. That's a real, repeatable
// content-triggered bug, not random noise, so retrying alone doesn't help
// (same input, same broken output). Fixes it structurally instead, by
// extracting just the first complete top-level JSON object out of the raw
// response before parsing, tolerating whatever comes after it.
export function extractFirstJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) return text;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === "\\") {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  // No matching close brace found — fall through and let JSON.parse fail
  // naturally on the original text, same behavior as before this existed.
  return text;
}
