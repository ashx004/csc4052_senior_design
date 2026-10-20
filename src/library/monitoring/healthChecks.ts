import "server-only";
import { probeUrl } from "../resolveReachableUrl";

// What /api/health checks: the things the site can't work without. The uptime
// monitor polls it, so a 503 here is what emails the team.
//
// - database: Firestore answers a read.
// - storage:  the Cloud Storage bucket answers a listing.
// - ai:       the Ollama box(es) answer. Secondary always (embeddings stay on it
//             even in cloud mode); Primary too unless AI_BACKEND=cloud.
//
// Results are cached briefly: the endpoint is public, and without the cache
// anyone could make every request hit Firestore, the bucket and both boxes.

export type CheckName = "database" | "storage" | "ai";
export type CheckResult = { ok: boolean; ms: number };
export type HealthReport = {
  status: "ok" | "down";
  checkedAt: string;
  checks: Record<CheckName, CheckResult>;
};

const CHECK_TIMEOUT_MS = 8000;
const CACHE_MS = 15_000;

let cached: { report: HealthReport; expiresAt: number } | null = null;
let inFlight: Promise<HealthReport> | null = null;

export async function getHealthReport(): Promise<HealthReport> {
  if (cached && cached.expiresAt > Date.now()) return cached.report;
  inFlight ??= runHealthChecks().finally(() => {
    inFlight = null;
  });
  const report = await inFlight;
  cached = { report, expiresAt: Date.now() + CACHE_MS };
  return report;
}

export async function runHealthChecks(
  checks: Record<CheckName, () => Promise<void>> = { database: checkDatabase, storage: checkStorage, ai: checkAi },
): Promise<HealthReport> {
  const names = Object.keys(checks) as CheckName[];
  const results = await Promise.all(names.map((name) => timed(name, checks[name])));
  const report = Object.fromEntries(names.map((name, i) => [name, results[i]])) as Record<CheckName, CheckResult>;
  return {
    status: results.every((r) => r.ok) ? "ok" : "down",
    checkedAt: new Date().toISOString(),
    checks: report,
  };
}

async function timed(name: CheckName, check: () => Promise<void>): Promise<CheckResult> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${CHECK_TIMEOUT_MS} ms`)), CHECK_TIMEOUT_MS);
      }),
    ]);
    return { ok: true, ms: Date.now() - started };
  } catch (error) {
    // The reason stays in the server log; the public response only says ok/not ok.
    console.error(`[health] ${name} check failed:`, error instanceof Error ? error.message : error);
    return { ok: false, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

async function checkDatabase() {
  const { adminDb } = await import("../firebaseAdmin");
  await adminDb.collection("errorGroups").limit(1).get();
}

async function checkStorage() {
  const { getBucket } = await import("../gcsStorage");
  await getBucket().getFiles({ maxResults: 1, autoPaginate: false });
}

async function checkAi() {
  const boxes: [string, string | undefined, string | undefined][] = [
    ["Secondary", process.env.OLLAMA_SECONDARY_URL, process.env.OLLAMA_SECONDARY_FALLBACK_URL],
  ];
  if (process.env.AI_BACKEND !== "cloud") {
    boxes.push(["Primary", process.env.OLLAMA_PRIMARY_URL, process.env.OLLAMA_PRIMARY_FALLBACK_URL]);
  }
  const headers = process.env.OLLAMA_AUTH_TOKEN ? { Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}` } : undefined;

  for (const [label, url, fallback] of boxes) {
    if (!url) throw new Error(`OLLAMA_${label.toUpperCase()}_URL is not set`);
    // Same candidate list the app itself uses: up if any address answers.
    const candidates = [url, ...(fallback ?? "").split(",")].map((u) => u.trim()).filter(Boolean);
    const reachable = await Promise.all(candidates.map((candidate) => probeUrl(candidate, "/api/tags", headers)));
    if (!reachable.some(Boolean)) throw new Error(`${label} Ollama box is unreachable at every address`);
  }
}
