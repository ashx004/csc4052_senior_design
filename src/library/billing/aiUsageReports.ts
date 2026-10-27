import "server-only";
import { summarizePerformance, type PerformanceReport, type PerformanceRow } from "./aiPerformance";

export const MAX_USAGE_ROWS = 50_000;
const DAY_MS = 86_400_000;

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Raw aiUsage rows for the last `days` days, newest first. Rows from before the timing fields existed get null durations and stages (untimed, not instant). */
export async function loadUsageRows(days: number): Promise<{ rows: PerformanceRow[]; truncated: boolean }> {
  const { adminDb } = await import("../firebaseAdmin");
  const cutoff = new Date(Date.now() - days * DAY_MS);
  const snap = await adminDb
    .collection("aiUsage")
    .where("at", ">=", cutoff)
    .orderBy("at", "desc")
    .select("feature", "model", "status", "incomplete", "durationMs", "waitMs", "genMs", "overheadMs", "deliverMs", "inputTokens", "outputTokens", "costMicros", "chargeMicros", "costSource", "at")
    .limit(MAX_USAGE_ROWS)
    .get();
  const rows: PerformanceRow[] = snap.docs.map((doc) => {
    const d = doc.data();
    const status = d.status ?? (d.incomplete ? "incomplete" : "ok");
    return {
      feature: typeof d.feature === "string" ? d.feature : "unknown",
      model: typeof d.model === "string" ? d.model : "",
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
      at: d.at?.toDate?.() ?? new Date(0),
    };
  });
  return { rows, truncated: snap.size >= MAX_USAGE_ROWS };
}

export async function getAiPerformanceReport(days: number): Promise<PerformanceReport> {
  const { rows, truncated } = await loadUsageRows(days);
  return summarizePerformance(rows, {
    since: new Date(Date.now() - days * DAY_MS).toISOString(),
    until: new Date().toISOString(),
    truncated,
  });
}
