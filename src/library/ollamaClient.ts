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
