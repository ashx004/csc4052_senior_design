// Per-task AI model preference. Unified 2026-09-21: this used to store a
// separate per-task pick plus a "reduce cold boots" unified-model override
// across 5 possible models (museGlimmer/nemotron/qwenCoder/qwen3A3b/
// fastResident) - now there's exactly one main model app-wide (Muse
// Glimmer, see ollamaClient.ts's resolveModelFromKey), so there's nothing
// left to store or choose between. Kept as a function (not a bare export)
// so every existing call site (chat/quiz/flashcards request bodies) keeps
// working unchanged - `task` is unused since there's nothing left to
// differentiate per task.
export type AiTask = "chat" | "quiz" | "flashcards";

export function getEffectiveModelKey(_task: AiTask): string {
  return "museGlimmer";
}

// Off by default - web/YouTube search reach outside the student's own
// course materials and aren't needed for most questions, so they're kept
// out of the tool schema entirely unless explicitly turned on, rather than
// always being one of the options the model has to weigh.
const EXTRA_TOOLS_KEY = "chat-extra-tools";

export function getStoredExtraTools(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(EXTRA_TOOLS_KEY) === "true";
}

export function setStoredExtraTools(value: boolean): void {
  localStorage.setItem(EXTRA_TOOLS_KEY, String(value));
}
