import "server-only";
import { TASK_ESTIMATES, measuredEstimates } from "./pricing";
import { medianCostByFeature } from "./aiPerformance";
import { loadUsageRows } from "./aiUsageReports";

export const ESTIMATE_DAYS = 30;
export const ESTIMATE_TTL_MS = 10 * 60 * 1000;
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
      const { rows } = await Promise.race([loadUsageRows(ESTIMATE_DAYS), timeout]).finally(() => clearTimeout(timer));
      cached = { expiresAt: Date.now() + ESTIMATE_TTL_MS, estimates: measuredEstimates(TASK_ESTIMATES, medianCostByFeature(rows)) };
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
