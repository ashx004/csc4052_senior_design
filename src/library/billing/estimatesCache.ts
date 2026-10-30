import "server-only";
import { TASK_ESTIMATES, measuredEstimates } from "./pricing";
import { medianChargeByFeature } from "./dailyRollup";
import { dayKeysBack, readDays } from "./rollupStore";

export const ESTIMATE_DAYS = 30;
/** Day documents change once a night, so hours of staleness cost nothing and save the read quota. */
export const ESTIMATE_TTL_MS = 6 * 60 * 60 * 1000;
export const ESTIMATE_FAILURE_TTL_MS = 60 * 1000;
export const ESTIMATE_READ_TIMEOUT_MS = 20 * 1000;

type Estimates = typeof TASK_ESTIMATES;
let cached: { expiresAt: number; estimates: Estimates } | null = null;
let inflight: Promise<void> | null = null;

function refresh(): void {
  inflight ??= (async () => {
    try {
      // A hung Firestore call must not pin `inflight` for the instance's lifetime.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("usage read timed out")), ESTIMATE_READ_TIMEOUT_MS); });
      // Day documents, never raw aiUsage rows: every page load can land here, and the read quota is 50,000 a day.
      const { rollups } = await Promise.race([readDays(dayKeysBack(ESTIMATE_DAYS)), timeout]).finally(() => clearTimeout(timer));
      cached = { expiresAt: Date.now() + ESTIMATE_TTL_MS, estimates: measuredEstimates(TASK_ESTIMATES, medianChargeByFeature(rollups)) };
    } catch (e) {
      console.error("Measured estimates failed; showing last known values:", e);
      // Keep whatever we last had (or the defaults) and wait a minute before retrying.
      cached = { expiresAt: Date.now() + ESTIMATE_FAILURE_TTL_MS, estimates: cached?.estimates ?? TASK_ESTIMATES };
    } finally {
      inflight = null;
    }
  })();
}

/** Never waits on the usage read: returns the last measured list (or the defaults when cold) and refreshes in the background when stale. */
export function currentEstimates(): Estimates {
  if (!cached || Date.now() >= cached.expiresAt) refresh();
  return cached?.estimates ?? TASK_ESTIMATES;
}

/** Tests only. */
export function resetEstimatesCache(): void { cached = null; inflight = null; }
