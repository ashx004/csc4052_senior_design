import type { ReportRow } from "@/src/library/analyticsReportContract";

export const panelClass =
  "min-w-0 rounded-2xl border border-border-light bg-bg-container p-5 sm:p-6";
export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-border-light bg-bg-container px-3 py-2 text-sm transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50";
export const inputClass =
  "rounded-lg border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary";

export function displayDate(date: string) {
  const normalized = /^\d{8}$/.test(date)
    ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
    : date;
  return new Date(`${normalized}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function displayTime(date: string) {
  return new Date(date).toLocaleString();
}

export function exportAnalytics(rows: ReportRow[], start: string, end: string) {
  const csv = [
    "Event,Count",
    ...rows.map((row) => `"${row.label.replaceAll('"', '""')}",${row.count}`),
  ].join("\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `catalyst-analytics-${start}-${end}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Days for the AI performance window: only the "Nd" presets (1..31) are honoured. Custom ranges are not supported by the endpoint, so they get 7. */
export function windowDays(query: string) {
  const match = /^(\d+)days$/.exec(new URLSearchParams(query).get("start") ?? "");
  const days = match ? Number(match[1]) : NaN;
  return Number.isInteger(days) && days >= 1 && days <= 31 ? days : 7;
}

/** Days for the AI pages from their `?days=`: a whole number clamped to 1..31, else 30. A month opens on enough
 * nightly summaries to show a trend, where a quiet week can be empty. */
export function aiWindowDays(raw: string | string[] | undefined) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d+$/.test(value)) return 30;
  return Math.min(31, Math.max(1, Number(value)));
}

export type AiFeatureView = "slow" | "cost" | "fail";

/** A drill-down page's `?view=`; anything missing or unrecognised is the slow view, so a hand-typed link still renders. */
export function aiFeatureView(raw: string | string[] | undefined): AiFeatureView {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "cost" || value === "fail" ? value : "slow";
}
