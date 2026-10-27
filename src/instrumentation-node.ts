// Node-only server startup (see instrumentation.ts).
import { setMeter } from "./library/ai/aiFetch";
import { createMeter } from "./library/billing/usageMeter";
import { setIncidentSink } from "./library/monitoring/telemetry";
import { recordRequestIncident } from "./library/monitoring/store";

// The AI client charges through this meter. It's registered here instead of
// imported by aiFetch.ts, which browser bundles reach through shared modules.
setMeter(createMeter());
setIncidentSink(recordRequestIncident);

// Promise rejections nothing awaited (fire-and-forget background work) never
// reach onRequestError, so they're reported here instead.
process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  void import("./library/monitoring/errorReporter").then(({ reportError }) =>
    reportError({ source: "server", message: err.message, name: err.name, stack: err.stack, route: "(background task)", build: process.env.NEXT_PUBLIC_BUILD_ID }),
  );
});

const MONITOR_POLL_MS = 60_000;
const ANALYTICS_WARM_MS = 15 * 60_000;

if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build"
) {
  let running = false;
  let lastAnalyticsAt = 0;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const [{ getHealthReport }, { getRealtimeReport, getAnalyticsReport }, { deleteExpiredMonitoringData, recordWorkerHeartbeat }] =
        await Promise.all([
          import("./library/monitoring/health"),
          import("./library/analyticsReports"),
          import("./library/monitoring/store"),
        ]);
      await recordWorkerHeartbeat().catch(() => null);
      const now = Date.now();
      const tasks: Promise<unknown>[] = [
        getHealthReport(),
        getRealtimeReport().catch(() => null),
        deleteExpiredMonitoringData(process.env.GA4_PROPERTY_ID),
      ];
      if (now - lastAnalyticsAt >= ANALYTICS_WARM_MS) {
        lastAnalyticsAt = now;
        tasks.push(getAnalyticsReport("7days", "").catch(() => null));
      }
      await Promise.allSettled(tasks);
    } catch {
      // Background monitoring errors are non-fatal.
    } finally {
      running = false;
    }
  };

  const initialTimer = setTimeout(() => {
    void tick();
  }, 5_000);
  initialTimer.unref?.();

  const intervalTimer = setInterval(() => {
    void tick();
  }, MONITOR_POLL_MS);
  intervalTimer.unref?.();
}
