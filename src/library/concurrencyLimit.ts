// Caps how many heavy AI jobs (a practice set can hold a model slot for up to
// two minutes) run at once, per student and across the whole site. The model
// serves chat, advising, quizzes and OCR from the same few slots, so without
// a cap a handful of students generating at the same moment would queue
// everyone else's chat behind them. The rate limiter (rateLimit.ts) only
// counts requests per minute; it can't see that earlier ones are still running.
//
// In-process, like the rate limiter: this deployment is one Node process.
// Kept on globalThis because Next.js can load a module once per route bundle.

interface Counters {
  total: number;
  perKey: Map<string, number>;
}

function counters(scope: string): Counters {
  const g = globalThis as typeof globalThis & { __catalystConcurrency?: Map<string, Counters> };
  const all = (g.__catalystConcurrency ??= new Map());
  let entry = all.get(scope);
  if (!entry) all.set(scope, (entry = { total: 0, perKey: new Map() }));
  return entry;
}

export type AcquireResult = { ok: true; release: () => void } | { ok: false; reason: "per-user" | "site-wide" };

/** Takes a slot, or says why not. `release` is safe to call more than once. */
export function acquireSlot(scope: string, key: string, limits: { perKey: number; total: number }): AcquireResult {
  const c = counters(scope);
  if ((c.perKey.get(key) ?? 0) >= limits.perKey) return { ok: false, reason: "per-user" };
  if (c.total >= limits.total) return { ok: false, reason: "site-wide" };
  c.total += 1;
  c.perKey.set(key, (c.perKey.get(key) ?? 0) + 1);
  let released = false;
  return {
    ok: true,
    release() {
      if (released) return;
      released = true;
      c.total -= 1;
      const left = (c.perKey.get(key) ?? 1) - 1;
      if (left <= 0) c.perKey.delete(key);
      else c.perKey.set(key, left);
    },
  };
}
