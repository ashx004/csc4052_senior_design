// Per-feature control over whether the main model reasons ("thinks") before
// answering. Every Primary call site asks this module instead of hardcoding
// a `think` value, so which features think lives in the env, not in source -
// the same "config lives in the env" rule resolveModelFromKey follows.
//
// Env values (per feature, see THINK_ENV below):
//   "on"                - send think:true. Ollama returns the reasoning in
//                         message.thinking, separate from the answer.
//   "off"               - send think:false. Fastest on a hybrid/instruct
//                         model; see OLLAMA_MODELS_ALWAYS_THINK for models
//                         that ignore it.
//   "low"|"medium"|"high" - send that fixed level (gpt-oss style models).
//   "levels"            - send the level the call site asks for (advising's
//                         per-step low/medium/high).
//   "omit"              - send nothing; the model's own default applies.
//
// Caveat worth knowing before flipping these: qwen3:30b-a3b is the 2507
// "Thinking" build, which reasons on every request no matter what. With
// "off" it still reasons, just inline in message.content ending in a stray
// </think> (confirmed live 2026-09-24: 15/16 think:false replies leaked).
// The one exception is schema-constrained calls (Ollama `format`), where the
// JSON grammar applies from the first token and leaves no room to reason -
// so "off" is genuinely faster for quiz/flashcards/discover even on that
// build. For free-text features (chat, course summary), "off" on an
// always-thinking model saves nothing and relies on stripThinkLeak; "on" is
// the clean choice there.

export type ThinkFeature =
  | "chat"
  | "quiz"
  | "flashcards"
  | "discover"
  | "course-summary"
  | "advising";

export type ThinkLevel = "low" | "medium" | "high";
export type ThinkValue = boolean | ThinkLevel;

const THINK_ENV: Record<ThinkFeature, string> = {
  chat: "OLLAMA_THINK_CHAT",
  quiz: "OLLAMA_THINK_QUIZ",
  flashcards: "OLLAMA_THINK_FLASHCARDS",
  discover: "OLLAMA_THINK_DISCOVER",
  "course-summary": "OLLAMA_THINK_COURSE_SUMMARY",
  // Pre-existing name, kept so current deployments don't need renaming.
  advising: "ADVISING_THINK_MODE",
};

// Used when a feature's env var is unset - matches what each call site sent
// before this module existed (every non-advising site hardcoded
// think:false; advising defaulted to "omit").
const DEFAULT_MODE: Record<ThinkFeature, string> = {
  chat: "off",
  quiz: "off",
  flashcards: "off",
  discover: "off",
  "course-summary": "off",
  advising: "omit",
};

export function resolveThink(feature: ThinkFeature, level: ThinkLevel = "medium"): ThinkValue | undefined {
  const mode = (process.env[THINK_ENV[feature]] || DEFAULT_MODE[feature]).trim().toLowerCase();
  switch (mode) {
    case "on":
    case "true":
      return true;
    case "off":
    case "false":
      return false;
    case "low":
    case "medium":
    case "high":
      return mode;
    case "levels":
      return level;
    default:
      return undefined;
  }
}

// Spread into an Ollama /api/chat body: `...thinkField("quiz")`. Omits the
// key entirely for "omit", since models without thinking support reject it.
export function thinkField(feature: ThinkFeature, level?: ThinkLevel): { think?: ThinkValue } {
  const think = resolveThink(feature, level);
  return think === undefined ? {} : { think };
}

// Models that reason on every request regardless of `think` (comma-separated
// tags, e.g. "qwen3:30b-a3b"). Only consulted to decide whether a streamed
// reply must be buffered for think-stripping - see mayLeakThinking.
export function modelAlwaysThinks(model: string): boolean {
  return (process.env.OLLAMA_MODELS_ALWAYS_THINK ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .includes(model);
}

// True when this feature's reply can carry raw reasoning inside
// message.content: thinking wasn't requested (so Ollama won't split it out
// into message.thinking), but the model reasons anyway.
export function mayLeakThinking(feature: ThinkFeature, model: string): boolean {
  const think = resolveThink(feature);
  return (think === false || think === undefined) && modelAlwaysThinks(model);
}
