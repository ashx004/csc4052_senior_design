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

// Single choke point for every large/main-model call in the app (chat,
// quiz generation, flashcard generation, AI advising, discover question
// generation, and OCR/vision - it's multimodal enough to cover that too).
// Unified 2026-09-21: previously a per-task/per-client-preference allow-list
// picking between museGlimmer/nemotron/qwenCoder/qwen3A3b/fastResident: now
// there's only one main model, so every key (including the legacy ones and
// the internal-only "ocr" key) resolves to the same place. `key` is kept as
// a parameter only because callers still pass one through (client-stored
// preference, warm-model requests) - nothing it can contain selects a
// different model anymore, so a stale/unrecognized client value is
// harmless. Outsourced small tasks (embeddings, query clarification,
// contextual chunking, student-profile/course-summary background
// summarization) deliberately do NOT go through this - they call their own
// small models directly, unchanged.
export function resolveModelFromKey(_key?: string): string {
  return process.env.OLLAMA_MODEL_MUSE_GLIMMER || "muse-glimmer:latest";
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
