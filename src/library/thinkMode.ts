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
//   "auto"              - chat only, and its default: reason as much as the
//                         question earns (see thinkRouter.ts and
//                         resolveChatThinking below).
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

import type { ThinkTier } from "@/src/library/thinkRouter";

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
// think:false; advising defaulted to "omit"). Chat is the exception: it
// routes per message instead of using one fixed setting.
const DEFAULT_MODE: Record<ThinkFeature, string> = {
  chat: "auto",
  quiz: "off",
  flashcards: "off",
  discover: "off",
  "course-summary": "off",
  advising: "omit",
};

// "auto" has no fixed value, so this returns undefined for it; chat callers
// use resolveChatThinking instead.
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
  if (feature === "chat" && chatThinkIsAuto()) return false; // resolveChatThinking never leaves an always-thinking model on think:false
  const think = resolveThink(feature);
  return (think === false || think === undefined) && modelAlwaysThinks(model);
}

function chatThinkIsAuto(): boolean {
  return (process.env[THINK_ENV.chat] || DEFAULT_MODE.chat).trim().toLowerCase() === "auto";
}

// Models that take low/medium/high instead of a boolean (comma-separated
// tags, e.g. "gpt-oss:20b").
function modelUsesThinkLevels(model: string): boolean {
  return (process.env.OLLAMA_MODELS_THINK_LEVELS ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .includes(model);
}

export type ChatThinking = {
  think?: ThinkValue;
  // Appended to the student's message for this request only, to cap how
  // long the model reasons; undefined when it needs no nudge.
  effortHint?: string;
};

// Always-thinking models ignore think:false (see the header), so for them
// the only lever is a reasoning budget in the prompt, with think:true so the
// reasoning stays out of the answer. Measured on qwen3:30b-a3b with the real
// chat prompt (3 runs each): appended to the question, the one-sentence
// budget took a lookup from ~7.5s to ~2.5s with a correct, concise answer;
// as a system message it did nothing. Any budget also shrinks the answer
// itself (a proof came back as one line), so only the fast tier gets one -
// standard and deep keep the full think.
const EFFORT_HINT: Record<ThinkTier, string | undefined> = {
  fast: "(Keep your thinking very short: one sentence.)",
  standard: undefined,
  deep: undefined,
};

const TIER_LEVEL: Record<ThinkTier, ThinkLevel> = { fast: "low", standard: "medium", deep: "high" };

// What to send for one chat turn. A fixed OLLAMA_THINK_CHAT (on/off/level)
// still overrides the router; only "auto" varies by tier.
export function resolveChatThinking(tier: ThinkTier, model: string): ChatThinking {
  if (!chatThinkIsAuto()) {
    const think = resolveThink("chat");
    return think === undefined ? {} : { think };
  }
  if (modelAlwaysThinks(model)) return { think: true, effortHint: EFFORT_HINT[tier] };
  if (modelUsesThinkLevels(model)) return { think: TIER_LEVEL[tier] };
  return { think: tier !== "fast" };
}
