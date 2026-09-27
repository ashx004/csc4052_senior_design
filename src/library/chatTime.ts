// Time-zone handling for the chat's calendar tools and "current time" line.
// The model reads and writes wall-clock times ("2026-09-26T15:00" = 3 PM
// where the student is), but the server runs in UTC - so every conversion
// has to go through the student's own time zone, sent by their browser.
// Without this, "3pm" was saved as 3 PM UTC (10 AM in Louisiana), and after
// 7 PM Central the model thought it was already tomorrow.

/** Louisiana Tech's zone - used when the browser didn't send a valid one. */
export const DEFAULT_TIME_ZONE = "America/Chicago";

export function resolveTimeZone(timeZone: unknown): string {
  if (typeof timeZone !== "string" || !timeZone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** Adds the browser's time zone to a chat context before it's sent. Pages
 *  build their own context objects, so this is applied at the request. */
export function withTimeZone<T extends object | null | undefined>(context: T): T {
  if (!context || typeof Intl === "undefined") return context;
  return { ...context, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
}

/** The wall-clock parts of an instant in a time zone. */
function wallParts(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** How far ahead of UTC the zone is at that instant, in ms (Chicago in summer: -5h). */
function zoneOffset(ms: number, timeZone: string): number {
  const w = wallParts(ms, timeZone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(ms / 1000) * 1000;
}

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * "2026-09-26T15:00" in the student's zone -> the UTC ISO string to store.
 * Also accepts a bare date (midnight). Returns null for anything else,
 * including strings that already carry an offset or "Z" - the tools ask the
 * model for local wall time, so an explicit offset means it got confused.
 */
export function localToUtcIso(local: string, timeZone: string): string | null {
  const m = LOCAL_PATTERN.exec(local.trim());
  if (!m) return null;
  const [year, month, day, hour = 0, minute = 0, second = 0] = m.slice(1).map((v) => (v === undefined ? undefined : Number(v))) as number[];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  // Two passes settle the offset across DST changes (the offset at the
  // guessed instant can differ from the one at the real instant).
  let ms = asUtc - zoneOffset(asUtc, timeZone);
  ms = asUtc - zoneOffset(ms, timeZone);
  return new Date(ms).toISOString();
}

/** A stored UTC ISO string -> "2026-09-26T15:00" in the student's zone. */
export function utcIsoToLocal(iso: string, timeZone: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const w = wallParts(ms, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

/** "Saturday, September 26, 2026 at 3:00 PM" in the student's zone. */
export function describeLocal(iso: string, timeZone: string, dateOnly = false): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(dateOnly ? {} : { hour: "numeric", minute: "2-digit" }),
  });
}
