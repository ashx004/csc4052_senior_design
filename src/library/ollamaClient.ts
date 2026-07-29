// Resolves which Ollama base URL a call should actually use: LAN-direct
// when reachable (measured ~11-18x lower latency than the public tunnel —
// see env.example), falling back to the public Cloudflare-tunneled URL for
// callers off the home LAN (e.g. a teammate developing remotely). Both
// URLs MUST already point at the Caddy auth-proxy in front of Ollama (see
// ollama-proxy/Caddyfile on each box, which checks the Bearer token) — this
// never talks to a raw Ollama port directly on either path, LAN or public.
//
// Deliberately a separate fast *reachability* probe rather than a shared
// timeout wrapped around the real request: Ollama's actual chat/embed
// calls can legitimately take 30-120s (cold model load, long generation),
// so a single short timeout on the real request would misread "just slow"
// as "unreachable" and either duplicate load onto both backends or kill a
// valid slow response. The probe only checks whether the LAN endpoint
// answers at all, cheaply and quickly, before the real (long-timeout) call
// its caller already has full control over.
const PROBE_TIMEOUT_MS = 2000;
// Same in-process memoization pattern as courseOfferings/cache.ts — this
// deployment is a single Node process, so caching reachability briefly
// avoids re-probing on every tool round within one chat turn.
const CACHE_TTL_MS = 30_000;

type ReachabilityEntry = { reachable: boolean; expiresAt: number };
const reachabilityCache = new Map<string, ReachabilityEntry>();

async function probe(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/tags`, {
      headers: process.env.OLLAMA_AUTH_TOKEN ? { Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}` } : {},
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function resolveOllamaBaseUrl(baseUrl: string, fallbackUrl?: string): Promise<string> {
  if (!fallbackUrl || fallbackUrl === baseUrl) return baseUrl;

  const now = Date.now();
  const cached = reachabilityCache.get(baseUrl);
  if (cached && cached.expiresAt > now) {
    return cached.reachable ? baseUrl : fallbackUrl;
  }

  const reachable = await probe(baseUrl);
  reachabilityCache.set(baseUrl, { reachable, expiresAt: now + CACHE_TTL_MS });
  return reachable ? baseUrl : fallbackUrl;
}
