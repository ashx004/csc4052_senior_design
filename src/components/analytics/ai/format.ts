import { formatUsd } from "@/src/library/billing/money";

/** formatUsd puts a minus after the dollar sign. */
export const usd = (micros: number) => (micros < 0 ? `-${formatUsd(-micros)}` : formatUsd(micros));
export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** A histogram percentile: "> 90 s" when it lies above the last bucket edge, a dash when too few requests were timed. */
export const percentileText = (ms: number | null, aboveMs: number | null) =>
  aboveMs !== null ? `> ${aboveMs / 1000} s` : ms === null ? "—" : seconds(ms);

/** Every window day is missing: there is nothing to total, so a page shows an empty state rather than zeros. */
export const hasNoSummaries = (missingDays: string[], days: number) => days > 0 && missingDays.length >= days;

/** "29 Oct" for a UTC day key. */
export function shortDay(day: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" })
    .formatToParts(new Date(`${day}T00:00:00.000Z`));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")} ${part("month")}`;
}

/** A part of a whole, 0..1. A zero or negative total is a zero share, never NaN. */
export const shareOf = (micros: number, totalMicros: number) =>
  totalMicros > 0 ? Math.min(1, Math.max(0, micros / totalMicros)) : 0;

/** "48%"; a real but tiny share reads "<1%", not "0%". */
export function formatShare(micros: number, totalMicros: number): string {
  const share = shareOf(micros, totalMicros);
  const percent = Math.round(share * 100);
  return share > 0 && percent === 0 ? "<1%" : `${percent}%`;
}

/** "29 Oct, 11:40 PM" in `timeZone` (the viewer's own when omitted). */
export function formatBuiltAt(iso: string, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone,
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")} ${part("month")}, ${part("hour")}:${part("minute")} ${part("dayPeriod")}`;
}
