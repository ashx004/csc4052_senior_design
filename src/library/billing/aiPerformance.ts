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
  /** Served by a fallback model after the first choice failed. */
  fallback?: boolean;
  /** Failure detail: the provider's HTTP status and a coarse class. Never message text. */
  httpStatus?: number | null; errorKind?: string | null;
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

export const isLocal = (row: PerformanceRow) => row.model.startsWith("ollama:");
export const isError = (row: PerformanceRow) => row.status === "error";
/** Rows whose costMicros means something: local calls are free and failures were never billed. Stopped streams stay (partial usage may be billed). */
export const isBilled = (row: PerformanceRow) => !isLocal(row) && !isError(row);

export const isIncomplete = (row: PerformanceRow) => row.status === "incomplete";
/** Rows whose duration says something about speed: a failed or stopped request ran short. */
export const isTimed = (row: PerformanceRow) => !isError(row) && !isIncomplete(row) && row.durationMs !== null;

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** Feature and model become map keys in the day rollup, and Firestore rejects an empty key. */
const name = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : "unknown");

/**
 * One aiUsage document's data as a row. Takes plain data; `at` only needs a toDate(). Never copies uid.
 * Rows from before the timing fields existed get null durations and stages (untimed, not instant);
 * rows from before the failure fields get fallback false and null httpStatus/errorKind.
 */
export function usageDocToRow(d: Record<string, unknown>): PerformanceRow {
  const status = d.status ?? (d.incomplete ? "incomplete" : "ok");
  const at = d.at as { toDate?: () => Date } | null | undefined;
  return {
    feature: name(d.feature),
    model: name(d.model),
    // Rows written before the status rename carry a boolean `incomplete` instead.
    status: status === "error" || status === "incomplete" ? status : "ok",
    durationMs: numOrNull(d.durationMs),
    waitMs: numOrNull(d.waitMs),
    genMs: numOrNull(d.genMs),
    overheadMs: num(d.overheadMs, 0),
    deliverMs: numOrNull(d.deliverMs),
    inputTokens: num(d.inputTokens, 0),
    outputTokens: num(d.outputTokens, 0),
    costMicros: num(d.costMicros, 0), // provider cost (admin dashboard)
    chargeMicros: num(d.chargeMicros, 0), // what the student paid (/billing)
    // A row with no recorded charge or source never had its cost resolved.
    costSource: typeof d.costSource === "string" && typeof d.chargeMicros === "number" ? d.costSource : "unknown",
    at: at?.toDate?.() ?? new Date(0),
    fallback: d.fallback === true,
    httpStatus: numOrNull(d.httpStatus),
    errorKind: typeof d.errorKind === "string" ? d.errorKind : null,
  };
}

/** Durations of the rows that say something about speed: the set every percentile is taken over. */
export function timedDurations(rows: PerformanceRow[]): number[] {
  return rows.filter(isTimed).map((r) => r.durationMs as number);
}

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
