// Pure per-feature statistics over aiUsage records, for the admin endpoint and /billing. No Firebase here.
import type { AiStatus } from "@/src/library/ai/aiFetch";

export type PerformanceRow = {
  feature: string; model: string; status: AiStatus;
  /** null = never timed (row predates telemetry); not the same as 0 ms. */
  durationMs: number | null; waitMs: number | null; genMs: number | null;
  overheadMs: number; deliverMs: number | null;
  inputTokens: number; outputTokens: number;
  /** What the PROVIDER charged us. The admin dashboard shows this. Never put a student id on this row. */
  costMicros: number;
  /** What the STUDENT was charged, provider fee included (see chargeForCost). /billing prices come from this one. */
  chargeMicros: number;
  /** How costMicros was resolved. "unknown" means never resolved, so the 0 is not a real price. */
  costSource: string;
  at: Date;
};

export type FeatureStats = {
  feature: string; requests: number; errors: number; errorRate: number;
  /** Requests served by the free local backend (model "ollama:..."); they carry no cost. */
  localRequests: number;
  p50Ms: number | null; p95Ms: number | null;
  /** Mean per stage over timed rows; a stage no row measured is null. Null overall when nothing streamed. */
  stages: { waitMs: number | null; genMs: number | null; overheadMs: number | null; deliverMs: number | null } | null;
  inputTokens: number; outputTokens: number;
  /** Billed spend only: local and failed requests are left out. */
  costMicros: number;
};

export type PerformanceReport = {
  since: string; until: string; truncated: boolean;
  features: FeatureStats[];
  total: { requests: number; errors: number; inputTokens: number; outputTokens: number; costMicros: number };
};

const isLocal = (row: PerformanceRow) => row.model.startsWith("ollama:");
const isError = (row: PerformanceRow) => row.status === "error";
/** Rows whose costMicros means something: local calls are free and failures were never billed. Stopped streams stay (partial usage may be billed). */
const isBilled = (row: PerformanceRow) => !isLocal(row) && !isError(row);

const isIncomplete = (row: PerformanceRow) => row.status === "incomplete";
/** Rows whose duration says something about speed: a failed or stopped request ran short. */
const isTimed = (row: PerformanceRow) => !isError(row) && !isIncomplete(row) && row.durationMs !== null;

/** Mean of the non-null values, or null when there are none. */
const meanOf = (values: (number | null)[]) => {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0) / present.length;
};

/** Nearest-rank percentile. Fewer than 5 values is too few to call a percentile, so null. */
export function percentile(values: number[], fraction: number): number | null {
  if (values.length < 5) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // Epsilon keeps 0.95 * 100 from rounding up to rank 96.
  const rank = Math.max(1, Math.ceil(fraction * sorted.length - 1e-9));
  return sorted[Math.min(rank, sorted.length) - 1];
}

export function summarizePerformance(
  rows: PerformanceRow[],
  window: { since: string; until: string; truncated: boolean },
): PerformanceReport {
  const byFeature = new Map<string, PerformanceRow[]>();
  for (const row of rows) {
    const list = byFeature.get(row.feature) ?? [];
    list.push(row);
    byFeature.set(row.feature, list);
  }

  const features: FeatureStats[] = [];
  for (const [feature, list] of byFeature) {
    const errors = list.filter(isError).length;
    // Timing comes from completed requests only: a provider that 500s in 50ms, or a stream the
    // student stopped, must not make a feature look fast. Their spend is still counted below.
    const ok = list.filter(isTimed);
    const durations = ok.map((r) => r.durationMs as number);
    const streamed = ok.filter((r) => r.waitMs !== null);
    features.push({
      feature,
      requests: list.length,
      errors,
      errorRate: errors / list.length,
      localRequests: list.filter(isLocal).length,
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      stages: streamed.length === 0 ? null : {
        waitMs: meanOf(streamed.map((r) => r.waitMs)),
        genMs: meanOf(streamed.map((r) => r.genMs)),
        overheadMs: meanOf(streamed.map((r) => r.overheadMs)),
        deliverMs: meanOf(streamed.map((r) => r.deliverMs)),
      },
      // Token totals deliberately include error and local rows.
      inputTokens: list.reduce((s, r) => s + r.inputTokens, 0),
      outputTokens: list.reduce((s, r) => s + r.outputTokens, 0),
      costMicros: list.filter(isBilled).reduce((s, r) => s + r.costMicros, 0),
    });
  }
  features.sort((a, b) => b.requests - a.requests);

  const total = features.reduce(
    (t, f) => ({
      requests: t.requests + f.requests,
      errors: t.errors + f.errors,
      inputTokens: t.inputTokens + f.inputTokens,
      outputTokens: t.outputTokens + f.outputTokens,
      costMicros: t.costMicros + f.costMicros,
    }),
    { requests: 0, errors: 0, inputTokens: 0, outputTokens: 0, costMicros: 0 },
  );
  return { ...window, features, total };
}

/** Median amount charged to the student per request, per feature (fee included). Rows with unresolved cost are skipped. Local, failed and stopped rows are ignored, including in the threshold count. */
export function medianCostByFeature(rows: PerformanceRow[], minRequests = 20): Map<string, number> {
  const byFeature = new Map<string, number[]>();
  for (const row of rows) {
    // Stopped streams are partial, so they would skew a per-request median low.
    if (!isBilled(row) || isIncomplete(row)) continue;
    // Unresolved cost (model missing from the rate table, legacy rows) is a 0 that means "unknown", not "free".
    if (row.costSource === "unknown") continue;
    const list = byFeature.get(row.feature) ?? [];
    // chargeMicros, not costMicros: /billing shows what the student pays (fee included), not the provider's price.
    list.push(row.chargeMicros);
    byFeature.set(row.feature, list);
  }
  const out = new Map<string, number>();
  for (const [feature, costs] of byFeature) {
    if (costs.length < minRequests) continue;
    costs.sort((a, b) => a - b);
    const mid = Math.floor(costs.length / 2);
    out.set(feature, costs.length % 2 ? costs[mid] : (costs[mid - 1] + costs[mid]) / 2);
  }
  return out;
}
