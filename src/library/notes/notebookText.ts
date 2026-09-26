// Combines a notebook's notes into the single document the quiz and
// flashcard generators read. Pure, so it's unit-tested.
export const NOTEBOOK_TEXT_LIMIT = 50_000; // same cap as single-document generation

export function assembleNotebookText(parts: { title: string; text: string }[], maxChars = NOTEBOOK_TEXT_LIMIT): string {
  let out = "";
  for (const part of parts) {
    const text = part.text.trim();
    if (!text) continue;
    const section = `${out ? "\n\n" : ""}## ${part.title.trim() || "Untitled note"}\n\n${text}`;
    if (out.length + section.length > maxChars) {
      out += section.slice(0, Math.max(0, maxChars - out.length));
      break;
    }
    out += section;
  }
  return out;
}
