// In-memory sliding-window rate limit — legitimate for this deployment
// (a single self-hosted Node process, not serverless/multi-instance), no
// need for Redis or external infra at this scale. Targets the GPU/LLM-
// cost-bearing routes specifically: /api/chat and /api/embed-document are
// the ones that actually overwhelmed the secondary box's single-request
// capacity tonight (confirmed live 2026-07-21) — an unauthenticated-before-
// tonight or just-enthusiastic client hammering either one is a real risk
// now that auth is required but nothing yet bounds request *frequency* per
// logged-in user.
const requestLog = new Map<string, number[]>(); // key -> recent request timestamps (ms)

export function checkRateLimit(
  key: string,
  windowMs: number,
  maxRequests: number
): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const timestamps = (requestLog.get(key) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= maxRequests) {
    const retryAfterSeconds = Math.ceil((windowMs - (now - timestamps[0])) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  timestamps.push(now);
  requestLog.set(key, timestamps);
  return { allowed: true };
}
