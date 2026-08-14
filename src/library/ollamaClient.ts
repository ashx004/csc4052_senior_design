// Resolves which Ollama base URL a call should actually use: LAN-direct
// when reachable (measured ~11-18x lower latency than the public tunnel —
// see env.example), falling back to the public Cloudflare-tunneled URL for
// callers off the home LAN (e.g. a teammate developing remotely). Both
// URLs MUST already point at the Caddy auth-proxy in front of Ollama (see
// ollama-proxy/Caddyfile on each box, which checks the Bearer token) — this
// never talks to a raw Ollama port directly on either path, LAN or public.
import { probeUrl, resolveReachableUrl } from "./resolveReachableUrl";

export async function resolveOllamaBaseUrl(baseUrl: string, fallbackUrl?: string): Promise<string> {
  const authHeaders = process.env.OLLAMA_AUTH_TOKEN
    ? { Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}` }
    : undefined;
  return resolveReachableUrl(baseUrl, fallbackUrl, (url) => probeUrl(url, "/api/tags", authHeaders));
}

// Server-side model resolution for the per-task model-selection settings
// (see chatMode.ts's TaskModelKey/UnifiedModelKey and TASK_MODEL_OPTIONS/
// UNIFIED_MODEL_OPTIONS). The client sends one of these keys, never a raw
// model string - this fixed allow-list is what actually decides which
// Ollama model runs, so an unrecognized/missing key can't reach Ollama with
// an arbitrary client-supplied model name. Falls open to qwen3A3b (the
// practical default from the 2026-08-13 benchmark - see chatMode.ts's
// DEFAULT_TASK_MODEL) on an invalid key, matching how avoidColdBoots was
// already coerced loosely rather than validated - not a new gap.
// warm-model/route.ts is the one caller that rejects an invalid key
// outright instead of falling open, since its whole job is confirming a
// specific real model gets warmed.
export type TaskModelKey = "museGlimmer" | "nemotron" | "qwenCoder" | "qwen3A3b";
export type UnifiedModelKey = "museGlimmer" | "qwenCoder" | "fastResident";

// "ocr" isn't a TaskModelKey/UnifiedModelKey - students never pick it from a
// dropdown. It's an internal-only warm key: gpt-oss:20b (fastResident) is
// small enough to sit in VRAM alongside the vision/OCR model without either
// evicting the other, so selecting fastResident as the AI Chat model is the
// one case where it's worth eagerly co-loading vision too, instead of
// leaving it lazy-loaded on first actual OCR use like every other model
// selection. See the settings page's warmEffectiveChatModel.
export function resolveModelFromKey(key: string | undefined): string {
  switch (key) {
    case "museGlimmer":
      return process.env.OLLAMA_MODEL_MUSE_GLIMMER || "muse-glimmer:latest";
    case "nemotron":
      return process.env.OLLAMA_MODEL_NEMOTRON || "nemotron-3.5-lightning:latest";
    case "qwenCoder":
      return process.env.OLLAMA_MODEL_QWEN_CODER || "qwen3-coder:30b";
    case "fastResident":
      return process.env.OLLAMA_MODEL_FAST || process.env.OLLAMA_MODEL || "gpt-oss:20b";
    case "ocr":
      return process.env.OLLAMA_OCR_MODEL || "qwen3-vl:8b";
    case "qwen3A3b":
    default:
      return process.env.OLLAMA_MODEL_QUALITY || process.env.OLLAMA_MODEL || "qwen3:30b-a3b";
  }
}

// Whichever model is currently selected for the AI Chat task (per-task pick,
// or the unified pick if "reduce cold boots" is on) is meant to boot
// immediately on selection and then stay resident indefinitely, until the
// student picks a different one - not just a hardcoded "fast" tier. See
// chat/route.ts and warm-model/route.ts, the two callers that load a chat
// model: both use this unconditionally, regardless of which key it is.
// Quiz/flashcard generation deliberately never sets keep_alive at all (see
// those routes) - those are one-off calls, not meant to camp in VRAM.
export const FAST_MODEL_KEEP_ALIVE = -1;
