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
