// Per-task AI model preferences, plus the "reduce cold boots" unified-model
// override. Replaces the previous single avoidColdBoots boolean (which
// itself replaced the original Fast/Quality mode toggle plus the separate
// per-message Boost escalation) with real per-task choice: a student can
// pick a different model for chat, quiz generation, and flashcard
// generation. Stored client-side only (same pattern as theme/coffee in
// theme.ts) and sent explicitly with every chat/generation request - the
// server has no independent copy, it just trusts whatever the client sends
// per-request, resolving it through a fixed server-side allow-list (see
// ollamaClient.ts's resolveModelFromKey) rather than trusting a raw model
// string from the client.
export type AiTask = "chat" | "quiz" | "flashcards";
export type TaskModelKey = "museGlimmer" | "nemotron" | "qwenCoder" | "qwen3A3b";
export type UnifiedModelKey = "museGlimmer" | "qwen3A3b" | "fastResident";

// Deliberately NOT a single "smartest -> fastest" spectrum: the 2026-08-13
// benchmark (avg tok/s across a short factual prompt, a coding task, and a
// long-context summary, run on ollama-primary, plus this app's real
// flashcard/quiz JSON schemas and the actual list_enrolled_classes/
// search_documents tool-calling chat flow through a full multi-round tool
// loop) found these 4 differ on more than raw speed - each label names the
// specific thing that model is actually best at. qwen3A3b's one caveat
// (occasionally including raw reasoning text in output, see
// OLLAMA_MODEL_QUALITY's comment) is already handled automatically by
// wrapDeltaForThinkStripping, so it doesn't count against picking it as the
// practical default - a fixable/already-fixed issue shouldn't scare off an
// otherwise-fastest model. `detail` is meant for a title/tooltip showing
// real numbers on hover. Ordered most practical (top) to least (bottom), so
// the top of the list is also the default (see DEFAULT_TASK_MODEL).
export const TASK_MODEL_OPTIONS: { key: TaskModelKey; label: string; detail: string }[] = [
  {
    key: "qwen3A3b",
    label: "Fastest — Qwen3 30B-A3B",
    detail: "188.5 tok/s avg, fastest of the 4 tested. Occasionally includes extra reasoning text in raw output, which the app automatically cleans up before you see it.",
  },
  {
    key: "qwenCoder",
    label: "Great for coding — Qwen3 Coder 30B",
    detail: "179.4 tok/s avg. Strongest structured-output and tool-use reliability in testing, with no known issues.",
  },
  {
    key: "nemotron",
    label: "Balanced — Nemotron 3.5 Lightning",
    detail: "106.8 tok/s avg. Solid all-around; one minor quiz-formatting issue found in testing.",
  },
  {
    key: "museGlimmer",
    label: "Best writing — Muse Glimmer",
    detail: "31.7 tok/s avg, slowest of the 4. Clearest, best-organized answers in testing, especially for longer explanations.",
  },
];

// Same per-model strengths as TASK_MODEL_OPTIONS, but for the single model
// the "reduce cold boots" checkbox pins across every task. Includes the
// existing Fast-tier model (fastResident) alongside the benchmarked ones,
// since it's small enough to comfortably coexist with vision/OCR. Same
// practical-first ordering as TASK_MODEL_OPTIONS.
export const UNIFIED_MODEL_OPTIONS: { key: UnifiedModelKey; label: string; detail: string }[] = [
  {
    key: "qwen3A3b",
    label: "Fastest — Qwen3 30B-A3B",
    detail: "188.5 tok/s avg, fastest of the 4 tested. Occasionally includes extra reasoning text in raw output, which the app automatically cleans up before you see it.",
  },
  {
    key: "fastResident",
    label: "Zero cold-boot — gpt-oss 20B",
    detail: "Always stays loaded in memory, even alongside document scanning - never has to swap in.",
  },
  {
    key: "museGlimmer",
    label: "Best writing — Muse Glimmer",
    detail: "31.7 tok/s avg, slowest of the 4. Clearest, best-organized answers in testing, especially for longer explanations.",
  },
];

// qwen3A3b: fastest of the 4, and its one caveat is already handled
// automatically (see TASK_MODEL_OPTIONS's comment) - the most practical
// default once that's accounted for. Also what OLLAMA_MODEL_QUALITY already
// defaults to today, so this is the least disruptive choice, not a new one.
const DEFAULT_TASK_MODEL: TaskModelKey = "qwen3A3b";
const DEFAULT_UNIFIED_MODEL: UnifiedModelKey = "qwen3A3b";

function taskModelStorageKey(task: AiTask): string {
  return `chat-task-model-${task}`;
}

export function isTaskModelKey(value: string | null): value is TaskModelKey {
  return value === "museGlimmer" || value === "nemotron" || value === "qwenCoder" || value === "qwen3A3b";
}

export function getStoredTaskModel(task: AiTask): TaskModelKey {
  if (typeof localStorage === "undefined") return DEFAULT_TASK_MODEL;
  const stored = localStorage.getItem(taskModelStorageKey(task));
  return isTaskModelKey(stored) ? stored : DEFAULT_TASK_MODEL;
}

export function setStoredTaskModel(task: AiTask, model: TaskModelKey): void {
  localStorage.setItem(taskModelStorageKey(task), model);
}

const REDUCE_COLD_BOOTS_KEY = "chat-reduce-cold-boots";
// On by default: funneling every task onto one model is the more practical
// default than juggling 3 potentially-different resident models - a
// student who wants per-task control can still turn it off.
const DEFAULT_REDUCE_COLD_BOOTS = true;

export function getStoredReduceColdBoots(): boolean {
  if (typeof localStorage === "undefined") return DEFAULT_REDUCE_COLD_BOOTS;
  const stored = localStorage.getItem(REDUCE_COLD_BOOTS_KEY);
  return stored === null ? DEFAULT_REDUCE_COLD_BOOTS : stored === "true";
}

export function setStoredReduceColdBoots(value: boolean): void {
  localStorage.setItem(REDUCE_COLD_BOOTS_KEY, String(value));
}

const UNIFIED_MODEL_KEY = "chat-unified-model";

export function isUnifiedModelKey(value: string | null): value is UnifiedModelKey {
  return value === "museGlimmer" || value === "qwen3A3b" || value === "fastResident";
}

export function getStoredUnifiedModel(): UnifiedModelKey {
  if (typeof localStorage === "undefined") return DEFAULT_UNIFIED_MODEL;
  const stored = localStorage.getItem(UNIFIED_MODEL_KEY);
  return isUnifiedModelKey(stored) ? stored : DEFAULT_UNIFIED_MODEL;
}

export function setStoredUnifiedModel(value: UnifiedModelKey): void {
  localStorage.setItem(UNIFIED_MODEL_KEY, value);
}

// What a given task should actually send to the server right now - the
// single place that resolves reduceColdBoots against the per-task choice,
// so every call site asks this instead of re-deriving the same branch.
export function getEffectiveModelKey(task: AiTask): TaskModelKey | UnifiedModelKey {
  return getStoredReduceColdBoots() ? getStoredUnifiedModel() : getStoredTaskModel(task);
}

// Resets every model-selection preference (the 3 per-task picks, reduce
// cold boots, and the unified pick) back to its default - used by the
// Settings page's "Restore to default" button. Deliberately scoped to just
// these 5 keys, not theme/coffee/extraTools, which have their own separate
// controls elsewhere on the page.
export function resetModelPreferences(): void {
  setStoredTaskModel("chat", DEFAULT_TASK_MODEL);
  setStoredTaskModel("quiz", DEFAULT_TASK_MODEL);
  setStoredTaskModel("flashcards", DEFAULT_TASK_MODEL);
  setStoredReduceColdBoots(DEFAULT_REDUCE_COLD_BOOTS);
  setStoredUnifiedModel(DEFAULT_UNIFIED_MODEL);
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
