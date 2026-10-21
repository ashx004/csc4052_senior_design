import { setTimeout as sleep } from "node:timers/promises";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { getAnalyticsReport, getRealtimeReport } = await import(
    "../src/library/analyticsReports"
  );
  const { withDeadline } = await import("../src/library/monitoring/probes");
  const { getHealthReport } = await import("../src/library/monitoring/health");
  const { recordWorkerHeartbeat, deleteExpiredMonitoringData } = await import(
    "../src/library/monitoring/store"
  );
  const { getReportingPropertyId } = await import(
    "../src/library/analyticsReportingConfig"
  );
  let nextDailyReport = 0;
  const shutdown = new AbortController();
  process.on("SIGTERM", () => shutdown.abort());
  process.on("SIGINT", () => shutdown.abort());
  while (!shutdown.signal.aborted) {
    const started = Date.now();
    const jobs: Promise<unknown>[] = [getHealthReport(), getRealtimeReport()];
    if (started >= nextDailyReport) {
      jobs.push(getAnalyticsReport("7days", ""));
      nextDailyReport = started + 15 * 60_000;
    }
    const results = await Promise.allSettled(jobs);
    if (results.some((result) => result.status === "rejected")) {
      console.warn(
        "[monitoring] A monitoring check failed. Check server configuration and service access.",
      );
    }
    try {
      await withDeadline(recordWorkerHeartbeat());
      let propertyId: string | undefined;
      try {
        propertyId = getReportingPropertyId();
      } catch {
        /* Health monitoring works without GA4. */
      }
      await withDeadline(deleteExpiredMonitoringData(propertyId));
    } catch {
      console.warn("[monitoring] Monitoring storage is unavailable.");
    }
    await sleep(Math.max(1000, 60_000 - (Date.now() - started)), undefined, {
      signal: shutdown.signal,
    }).catch(() => {});
  }
}

main().catch(() => {
  console.error("Monitoring worker could not start.");
  process.exitCode = 1;
});
