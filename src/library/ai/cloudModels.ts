// Which cloud model serves which feature, and how much it may write.
// Config lives in the env, not in code (same rule as OLLAMA_MODEL_MAIN in
// ollamaClient.ts): an unset AI_MODEL_DEFAULT is a deployment error that
// should surface loudly. Picks and their evidence: scripts/cloud-benchmark-results.md.
//
// A model id names its provider: "openrouter:<openrouter model id>" or
// "google:<gemini model id>".

import { currentAiUser } from "./usageScope";

// AI_BACKEND:
//   cloud    every request goes to the cloud models
//   testers  only the accounts in AI_CLOUD_TESTERS (comma-separated uids) do,
//            everyone else stays on Ollama: for trying cloud AI and its
//            metering on the live site before the paywall exists
//   ollama   (or unset) nobody does
// "testers" needs the route to have called enterAiUser() first, which every
// AI route does right after verifying the student.
export function isCloudBackend(): boolean {
  const mode = process.env.AI_BACKEND;
  if (mode === "cloud") return true;
  if (mode !== "testers") return false;
  const uid = currentAiUser();
  return Boolean(uid && cloudTesters().includes(uid));
}

function cloudTesters(): string[] {
  return (process.env.AI_CLOUD_TESTERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export type FeatureGroup = "default" | "generation" | "ocr" | "light";

// Every /api/chat call site sends X-Catalyst-Feature; anything unlisted
// (chat, advising, course summary, syllabus) is "default".
const GROUPS: Record<string, FeatureGroup> = {
  "quiz-generation": "generation",
  "flashcard-generation": "generation",
  "practice-generation": "generation",
  "discover-learn-question": "generation",
  ocr: "ocr",
  "thought-summary": "light",
  "query-clarifier": "light",
  "student-profile": "light",
  "contextual-chunking": "light",
};

export function featureGroup(feature: string): FeatureGroup {
  return GROUPS[feature] ?? "default";
}

const MODEL_ENV: Record<FeatureGroup, string> = {
  default: "AI_MODEL_DEFAULT",
  generation: "AI_MODEL_GENERATION",
  ocr: "AI_MODEL_OCR",
  light: "AI_MODEL_LIGHT",
};

export function modelForFeature(feature: string): string {
  const model = process.env[MODEL_ENV[featureGroup(feature)]] || process.env.AI_MODEL_DEFAULT;
  if (!model) throw new Error("AI_MODEL_DEFAULT is not configured.");
  return model;
}

/** The backup model tried once when the primary provider is down, or "" for none. */
export function fallbackModel(): string {
  return process.env.AI_MODEL_FALLBACK ?? "";
}

// Output caps for callers that don't set num_predict. Every cloud token is
// billed, and a model stuck repeating itself (seen on OCR diagram pages)
// would otherwise run to the provider's maximum on the student's balance.
const OUTPUT_CAPS: Record<FeatureGroup, number> = {
  default: 4096,
  generation: 8192,
  ocr: 3000,
  light: 1024,
};

export function outputCap(feature: string): number {
  return OUTPUT_CAPS[featureGroup(feature)];
}

// The student's chat speed (the Fast / Balanced / Thorough setting) changes
// only the chat answer itself, never background work or study-set generation.
//   fast      a quicker, cheaper model with thinking off
//             (AI_MODEL_FAST, else AI_MODEL_LIGHT)
//   balanced  the default model; the chat route's thinking router decides
//             per question how much to think (chatThinking.ts)
//   thorough  thinking always on at high effort, with room to finish
//             (AI_MODEL_THOROUGH, else the default model)
export type SpeedOverride = { model?: string; think?: boolean | "high"; maxTokensFactor?: number };

export function speedOverride(feature: string, speed: "fast" | "balanced" | "thorough" | undefined): SpeedOverride {
  if (feature !== "chat" || !speed || speed === "balanced") return {};
  if (speed === "fast") {
    const model = process.env.AI_MODEL_FAST || process.env.AI_MODEL_LIGHT;
    return { ...(model ? { model } : {}), think: false };
  }
  return { ...(process.env.AI_MODEL_THOROUGH ? { model: process.env.AI_MODEL_THOROUGH } : {}), think: "high", maxTokensFactor: 2 };
}
