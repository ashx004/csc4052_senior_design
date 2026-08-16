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
// an arbitrary client-supplied model name. Falls open to museGlimmer (the
// app-wide default as of 2026-08-16 - see chatMode.ts's DEFAULT_TASK_MODEL)
// on an invalid key, matching how avoidColdBoots was already coerced
// loosely rather than validated - not a new gap.
// warm-model/route.ts is the one caller that rejects an invalid key
// outright instead of falling open, since its whole job is confirming a
// specific real model gets warmed.
export type TaskModelKey = "museGlimmer" | "nemotron" | "qwenCoder" | "qwen3A3b";
export type UnifiedModelKey = "museGlimmer" | "qwenCoder" | "fastResident";

// "ocr" isn't a TaskModelKey/UnifiedModelKey - students never pick it from a
// dropdown. It's an internal-only warm key, used by the settings page's
// warmEffectiveChatModel to eagerly co-warm vision alongside whichever chat
// model is currently effective.
// Changed 2026-08-16: now the SAME model as "museGlimmer" by default (see
// OLLAMA_OCR_MODEL in env.example) rather than a separate dedicated vision
// model - Muse Glimmer has a real native vision encoder (confirmed via
// `ollama show`'s projector_info and a 6-image OCR accuracy test scoring
// 6/6 exact transcriptions, including a rotated/blurred stress test), so
// when it's also the selected chat model there's only one model resident
// for both jobs, not two competing for the same VRAM.
export function resolveModelFromKey(key: string | undefined): string {
  switch (key) {
    case "nemotron":
      return process.env.OLLAMA_MODEL_NEMOTRON || "nemotron-3.5-lightning:latest";
    case "qwenCoder":
      return process.env.OLLAMA_MODEL_QWEN_CODER || "qwen3-coder:30b";
    case "fastResident":
      return process.env.OLLAMA_MODEL_FAST || process.env.OLLAMA_MODEL || "gpt-oss:20b";
    case "qwen3A3b":
      return process.env.OLLAMA_MODEL_QUALITY || process.env.OLLAMA_MODEL || "qwen3:30b-a3b";
    // Kept as its own env var (not folded into OLLAMA_MODEL_MUSE_GLIMMER)
    // so ocrClient.ts's real document-OCR calls and this pre-warm path stay
    // sourced from the same single place — see OLLAMA_OCR_MODEL in
    // env.example, now defaulted to muse-glimmer:latest for the same
    // native-vision reason as the case below.
    case "ocr":
      return process.env.OLLAMA_OCR_MODEL || "muse-glimmer:latest";
    case "museGlimmer":
    default:
      return process.env.OLLAMA_MODEL_MUSE_GLIMMER || "muse-glimmer:latest";
  }
}

// Whichever model is currently selected for the AI Chat task (per-task pick,
// or the unified pick if "reduce cold boots" is on) is meant to boot
// immediately on selection and stay resident while actively used - not just
// a hardcoded "fast" tier. See chat/route.ts and warm-model/route.ts, the
// two callers that load a chat model: both use this unconditionally,
// regardless of which key it is.
// Changed 2026-08-15 from -1 (never unload) to "1h": an idle-loaded model is
// pure GPU power draw with nobody using it, so it auto-unloads after an hour
// of no use on both primary and secondary rather than camping in VRAM
// forever. Matches OLLAMA_KEEP_ALIVE now set as the daemon default on both
// boxes - this just makes the explicit per-request value agree with it.
// Changed 2026-08-16: reads from OLLAMA_MODEL_KEEP_ALIVE (set to 2h in this
// repo's .env) instead of a hardcoded literal, now that the app defaults to
// one shared model (Muse Glimmer, see chatMode.ts) for chat AND OCR - a
// single model doing double duty is worth keeping loaded a bit longer than
// the old 1h, since reloading it from cold now costs more (it's serving
// everything, not just one task) while there's no longer a second model's
// VRAM footprint to weigh against keeping it around. Still defaults to "1h"
// if the env var is unset, matching the previous behavior.
// Quiz/flashcard generation deliberately never sets keep_alive at all (see
// those routes) - those are one-off calls, not meant to camp in VRAM.
export const FAST_MODEL_KEEP_ALIVE = process.env.OLLAMA_MODEL_KEEP_ALIVE || "1h";
