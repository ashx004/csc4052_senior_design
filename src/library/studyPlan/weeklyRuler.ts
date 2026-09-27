function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local Monday 00:00 of the week containing `date`. */
export function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow; // shift back to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function weekDateKeys(monday: Date): string[] {
  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    keys.push(localDateKey(d));
  }
  return keys;
}

export const NICE_MINUTE_STEPS = [
  15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480, 600, 720,
];

export function roundUpToNiceMinutes(minutes: number): number {
  if (minutes <= 0) return NICE_MINUTE_STEPS[0];
  for (const step of NICE_MINUTE_STEPS) if (minutes <= step) return step;
  return NICE_MINUTE_STEPS[NICE_MINUTE_STEPS.length - 1];
}

function tickLabel(minutes: number): string {
  if (minutes === 0) return "0";
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${minutes % 60}m`;
}

export function computeRuler(minutesByDay: number[]): {
  niceMax: number;
  ticks: { minutes: number; label: string }[];
} {
  const dataMax = Math.max(0, ...minutesByDay.filter((m) => Number.isFinite(m)));
  const niceMax = roundUpToNiceMinutes(dataMax);
  const ticks = [0, Math.round(niceMax / 2), niceMax].map((minutes) => ({
    minutes,
    label: tickLabel(minutes),
  }));
  return { niceMax, ticks };
}

export function barHeight(
  minutes: number,
  niceMax: number,
  maxBody: number,
  minVisible = 6
): number {
  if (minutes <= 0 || niceMax <= 0) return 0;
  const raw = Math.round((minutes / niceMax) * maxBody);
  return Math.max(minVisible, Math.min(maxBody, raw));
}

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m === 0) return "0m";
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}
