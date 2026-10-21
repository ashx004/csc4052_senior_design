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
  const writes = await Promise.allSettled(
    services.map((status) => withDeadline(saveServiceStatus(status))),
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
