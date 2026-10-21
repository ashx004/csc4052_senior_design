export type ServiceId = "ai" | "vector" | "storage" | "firestore";
export type ServiceState = "healthy" | "degraded" | "down" | "unconfigured";
export type IncidentKind =
  | "outage"
  | "request_failure"
  | "timeout"
  | "slow_generation";

export const serviceNames: Record<ServiceId, string> = {
  ai: "AI models",
  vector: "Vector database",
  storage: "File storage",
  firestore: "Firestore",
};

export type ServiceStatus = {
  id: ServiceId;
  status: ServiceState;
  message: string;
  checkedAt: string;
  latencyMs: number;
};

export type Incident = {
  id: string;
  service: ServiceId;
  kind: IncidentKind;
  message: string;
  startedAt: string;
  resolvedAt: string | null;
};

export type HealthReport = {
  services: ServiceStatus[];
  incidents: Incident[];
  checkedAt: string;
  historyAvailable: boolean;
  workerLastSeen: string | null;
};

export type UserPeaks = {
  concurrent: number | null;
  concurrentAt: string;
  daily: number | null;
  dailyDate: string | null;
  since: string;
};

export type RealtimeReport = {
  concurrentUsers: number;
  windowMinutes: number;
  checkedAt: string;
  peaks: UserPeaks | null;
  storageAvailable: boolean;
};
