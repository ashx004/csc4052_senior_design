// Which cloud model serves which feature, and how much it may write.
// Config lives in the env, not in code (same rule as OLLAMA_MODEL_MAIN in
// ollamaClient.ts): an unset AI_MODEL_DEFAULT is a deployment error that
// should surface loudly. Picks and their evidence: scripts/cloud-benchmark-results.md.
//
// A model id names its provider: "openrouter:<openrouter model id>" or
// "google:<gemini model id>".

export function isCloudBackend(): boolean {
  return process.env.AI_BACKEND === "cloud";
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
