// Persisted background-job states shared by OCR and Advising. Keep these
// values stable: existing job documents and browser responses use them.
export const JOB_STATUS = {
  pending: "queued",
  inProgress: "processing",
  completed: "complete",
  failed: "failed",
  cancelled: "cancelled",
  superseded: "superseded",
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];
export type ActiveJobStatus = typeof JOB_STATUS.pending | typeof JOB_STATUS.inProgress;
export type TerminalJobStatus = Exclude<JobStatus, ActiveJobStatus>;

export const ACTIVE_JOB_STATUSES: readonly ActiveJobStatus[] = [
  JOB_STATUS.pending,
  JOB_STATUS.inProgress,
];

export const TERMINAL_JOB_STATUSES: readonly TerminalJobStatus[] = [
  JOB_STATUS.completed,
  JOB_STATUS.failed,
  JOB_STATUS.cancelled,
  JOB_STATUS.superseded,
];

export function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === "string" && (Object.values(JOB_STATUS) as string[]).includes(value);
}

export function isActiveJobStatus(value: unknown): value is ActiveJobStatus {
  return value === JOB_STATUS.pending || value === JOB_STATUS.inProgress;
}

export function isTerminalJobStatus(value: unknown): value is TerminalJobStatus {
  return isJobStatus(value) && !isActiveJobStatus(value);
}
