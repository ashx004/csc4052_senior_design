import "server-only";
import { isFirestoreQuotaError } from "../firestoreQuota";
import { featureDetail, mergeRollups, type DailyRollup, type FeatureDetail, type MergedRollup } from "./dailyRollup";
import { marginMicros, summarizeLedger, type MoneySummary } from "./moneySummary";
import { dayKeysBack, readDays, readSnapshot } from "./rollupStore";

const DAY_MS = 86_400_000;

export type AdminAiReport = Omit<MergedRollup, "money" | "unusedBalanceMicros" | "unusedBalanceAsOf"> & {
  /** Cost and charge leave out unknown-cost rows (counted in total.unknownCostRows), so the margin is real.
   * The unused balance is a point-in-time figure from `unusedBalanceAsOf`, the newest window day that recorded one; both null when none did. */
  money: MoneySummary & {
    costMicros: number; chargeMicros: number; marginMicros: number;
    unusedBalanceMicros: number | null; unusedBalanceAsOf: string | null;
  };
  source: "live" | "snapshot";
  builtAt: string; // ISO
  /** Why the data is not live; null when it is. */
  staleReason: "quota" | "unavailable" | null;
  /** Present only when the report was asked for one feature. */
  featureDetail?: FeatureDetail;
};

const dayStart = (day: string) => Date.parse(`${day}T00:00:00.000Z`);

/** The one place a report is made, from either source. `missingDays` is every window day with no document, oldest first. */
function assembleReport(
  rollups: DailyRollup[], windowKeys: string[], source: AdminAiReport["source"], builtAt: Date, staleReason: AdminAiReport["staleReason"],
  feature: string | undefined,
): AdminAiReport {
  // A day counted twice would double every figure, so each window day is taken at most once.
  const byDay = new Map<string, DailyRollup>();
  for (const rollup of rollups) {
    if (windowKeys.includes(rollup.day) && !byDay.has(rollup.day)) byDay.set(rollup.day, rollup);
  }
  const { money, unusedBalanceMicros, unusedBalanceAsOf, ...merged } = mergeRollups([...byDay.values()]);
  const window = [...windowKeys].sort();
  const { costMicros, chargeMicros } = merged.total;
  return {
    ...merged,
    since: window.length === 0 ? "" : new Date(dayStart(window[0])).toISOString(),
    until: window.length === 0 ? "" : new Date(dayStart(window[window.length - 1]) + DAY_MS).toISOString(),
    missingDays: window.filter((day) => !byDay.has(day)),
    // Window sums with no day behind them are zeros here; missingDays says which days are absent, and the pages
    // show an empty state when all of them are. A balance is not a sum, so with no day to read it from it stays null.
    money: {
      ...(money ?? summarizeLedger([])),
      costMicros, chargeMicros, marginMicros: marginMicros(chargeMicros, costMicros),
      unusedBalanceMicros, unusedBalanceAsOf,
    },
    source, builtAt: builtAt.toISOString(), staleReason,
    ...(feature === undefined ? {} : { featureDetail: featureDetail([...byDay.values()], feature) }),
  };
}

export const REPORT_TTL_MS = 10 * 60 * 1000;
export const REPORT_FAILURE_TTL_MS = 60 * 1000;
export const REPORT_READ_TIMEOUT_MS = 20 * 1000;
/** Shorter than the Firestore read's, so a cold request that waits on both still answers before the client's 40 s abort. */
export const REPORT_SNAPSHOT_TIMEOUT_MS = 8 * 1000;

function withTimeout<T>(promise: Promise<T>, what: string, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Live from the day documents; when Firestore refuses, the GCS snapshot. Live and snapshot days are never mixed. */
async function buildReport(days: number, feature: string | undefined): Promise<AdminAiReport> {
  const keys = dayKeysBack(days);
  let live: DailyRollup[];
  try {
    live = (await withTimeout(readDays(keys), "Rollup read", REPORT_READ_TIMEOUT_MS)).rollups;
  } catch (e) {
    const snapshot = await withTimeout(readSnapshot(), "Snapshot read", REPORT_SNAPSHOT_TIMEOUT_MS).catch(() => null);
    // Rethrown unchanged so the caller can still tell a quota error from any other.
    if (!snapshot) throw e;
    console.error("AI report: Firestore read failed; serving the GCS snapshot:", e);
    return assembleReport(snapshot.rollups, keys, "snapshot", snapshot.builtAt, isFirestoreQuotaError(e) ? "quota" : "unavailable", feature);
  }
  return assembleReport(live, keys, "live", new Date(), null, feature);
}

const cacheKey = (days: number, feature: string | undefined) => (feature === undefined ? `${days}` : `${days}:${feature}`);
const cached = new Map<string, { expiresAt: number; report: AdminAiReport }>();
const inflight = new Map<string, Promise<AdminAiReport>>();

function refresh(days: number, feature: string | undefined): Promise<AdminAiReport> {
  const key = cacheKey(days, feature);
  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const report = await buildReport(days, feature);
        // A snapshot is checked against Firestore again soon, so live data returns once the quota resets.
        const ttl = report.source === "live" ? REPORT_TTL_MS : REPORT_FAILURE_TTL_MS;
        cached.set(key, { expiresAt: Date.now() + ttl, report });
        return report;
      } catch (e) {
        const last = cached.get(key);
        // Keep the last good report and wait a minute before retrying.
        if (last) cached.set(key, { expiresAt: Date.now() + REPORT_FAILURE_TTL_MS, report: last.report });
        throw e;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, pending);
  }
  return pending;
}

/** The admin AI report over the last `days` complete UTC days, with `feature`'s detail when one is named.
 * Waits only when nothing is cached; a stale report is served while a fresh one builds. */
export async function getAdminAiReport(days: number, feature?: string): Promise<AdminAiReport> {
  const hit = cached.get(cacheKey(days, feature));
  if (!hit) return refresh(days, feature);
  if (Date.now() >= hit.expiresAt) {
    refresh(days, feature).catch((e) => console.error("AI report refresh failed; showing the last report:", e));
  }
  return hit.report;
}

/** Tests only. */
export function resetAdminAiReportCache(): void { cached.clear(); inflight.clear(); }
