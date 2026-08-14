// Shared LAN-direct/public-tunnel-fallback resolver for every self-hosted
// service this app talks to (Ollama, MinIO, Qdrant): probe the LAN endpoint
// cheaply and fall back to the public Cloudflare-tunneled URL when it's
// unreachable (e.g. a teammate developing remotely, or the LAN box itself
// being down). Was duplicated verbatim in ollamaClient.ts and minioClient.ts;
// centralized here rather than adding a third copy for Qdrant.
//
// Deliberately a separate fast *reachability* probe rather than a shared
// timeout wrapped around the real request: these services' real calls can
// legitimately take a long time (model load/generation, large uploads,
// large searches), so a single short timeout on the real request would
// misread "just slow" as "unreachable."
const PROBE_TIMEOUT_MS = 2000;
// Same in-process memoization pattern as courseOfferings/cache.ts — this
// deployment is a single Node process, so caching reachability briefly
// avoids re-probing on every call within one request/chat turn.
const CACHE_TTL_MS = 30_000;

type ReachabilityEntry = { reachable: boolean; expiresAt: number };
const reachabilityCache = new Map<string, ReachabilityEntry>();

export async function probeUrl(url: string, path: string, headers?: HeadersInit): Promise<boolean> {
  try {
    const response = await fetch(`${url}${path}`, {
      headers,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function resolveReachableUrl(
  baseUrl: string,
  fallbackUrl: string | undefined,
  probe: (baseUrl: string) => Promise<boolean>
): Promise<string> {
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
