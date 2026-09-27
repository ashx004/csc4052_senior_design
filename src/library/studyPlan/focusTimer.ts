export type MillisLike = { toMillis?: () => number } | null | undefined;
export type Period = { startedAt: MillisLike; endedAt: MillisLike };

/** Resolved Firestore timestamps expose toMillis(); pending serverTimestamp() does not. */
export function resolveMillis(ts: MillisLike): number | null {
  if (ts && typeof ts.toMillis === "function") {
    const ms = ts.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/** Total active minutes across periods. Open period runs until nowMs.
 *  Unresolved starts contribute 0 (never epoch), and no period exceeds nowMs. */
export function computeActiveMinutes(periods: Period[], nowMs: number): number {
  let totalMs = 0;
  for (const p of periods ?? []) {
    const start = resolveMillis(p.startedAt);
    if (start === null) continue; // pending start => cannot measure
    const rawEnd = resolveMillis(p.endedAt) ?? nowMs; // open period => now
    const end = Math.min(rawEnd, nowMs);
    if (end > start) totalMs += end - start;
  }
  return Math.floor(totalMs / 60000);
}

export function computeElapsedSeconds(
  input: {
    activeMinutes: number;
    status: string;
    periods: Period[];
    startedAt: MillisLike;
  },
  nowMs: number
): number {
  const base = (input.activeMinutes ?? 0) * 60;
  if (input.status !== "active") return base;

  const periods = input.periods ?? [];
  const last = periods[periods.length - 1];
  const lastOpen = last && resolveMillis(last.endedAt) === null;

  let start: number | null;
  if (lastOpen) {
    start = resolveMillis(last.startedAt);
    if (start === null) return base; // pending open start — do not fall back to session start
  } else {
    start = resolveMillis(input.startedAt);
  }
  if (start === null) return base;

  const since = Math.max(0, Math.floor((nowMs - start) / 1000));
  return base + since;
}
