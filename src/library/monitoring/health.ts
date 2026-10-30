import "server-only";
import { probeServices, withDeadline } from "./probes";
import {
  readIncidentHistory,
  readWorkerHeartbeat,
  saveServiceStatus,
} from "./store";
import type { HealthReport } from "./types";

let cached: HealthReport | undefined;
let pending: Promise<HealthReport> | undefined;
const lastPersisted = new Map<string, { status: string; savedAt: number }>();
const HEALTHY_PERSIST_INTERVAL_MS = 30 * 60_000;

export async function getHealthReport(): Promise<HealthReport> {
  if (cached && Date.now() - Date.parse(cached.checkedAt) < 60_000)
    return cached;
  if (pending) return pending;
  pending = refreshHealth();
  try {
    cached = await pending;
    return cached;
  } finally {
    pending = undefined;
  }
}

async function refreshHealth(): Promise<HealthReport> {
  const services = await probeServices();
  const report: HealthReport = {
    services,
    incidents: [],
    checkedAt: new Date().toISOString(),
    historyAvailable: true,
    workerLastSeen: null,
  };
  const now = Date.now();
  const servicesToPersist = services.filter((status) => {
    const previous = lastPersisted.get(status.id);
    if (!previous) return true;
    if (previous.status !== status.status || status.status !== "healthy") {
      return true;
    }
    return now - previous.savedAt >= HEALTHY_PERSIST_INTERVAL_MS;
  });
  const writes = await Promise.allSettled(
    servicesToPersist.map(async (status) => {
      await withDeadline(saveServiceStatus(status));
      lastPersisted.set(status.id, { status: status.status, savedAt: now });
    }),
  );
  if (writes.some((result) => result.status === "rejected"))
    report.historyAvailable = false;
  try {
    report.incidents = await withDeadline(readIncidentHistory());
    report.workerLastSeen = await withDeadline(readWorkerHeartbeat());
  } catch {
    report.historyAvailable = false;
  }
  return report;
}
