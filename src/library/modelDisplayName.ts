// Readable names for the Ollama tags this app is configured with (see
// OLLAMA_MODEL_MAIN / OLLAMA_MODEL_OCR in env.example). An unknown tag is
// shown as-is rather than guessed at, so swapping models in the env never
// needs a code change to stay accurate - it just looks a little rawer until
// someone adds a friendly name here.
const FRIENDLY_NAMES: Record<string, string> = {
  "qwen3:30b-a3b": "Qwen3 30B-A3B",
  "qwen3:30b-a3b-instruct-2507-q4_K_M": "Qwen3 30B-A3B Instruct",
  "qwen3-vl:4b-instruct": "Qwen3-VL 4B Instruct",
  "qwen3-vl:4b": "Qwen3-VL 4B",
  "gemma4:12b": "Gemma 4 12B",
  "gemma4:26b": "Gemma 4 26B",
  "gpt-oss:20b": "gpt-oss 20B",
  "muse-glimmer:latest": "Muse Glimmer",
};

export function modelDisplayName(tag: string | null | undefined): string | null {
  const trimmed = tag?.trim();
  if (!trimmed) return null;
  return FRIENDLY_NAMES[trimmed] ?? trimmed;
}
