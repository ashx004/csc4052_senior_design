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

// API consumers use these stable, user-facing values. Persisted values above
// remain unchanged so existing Firestore jobs and worker queries keep working.
export const PUBLIC_JOB_STATUS = {
  pending: "pending",
  inProgress: "in_progress",
  completed: "completed",
  failed: "failed",
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];
export type ActiveJobStatus = typeof JOB_STATUS.pending | typeof JOB_STATUS.inProgress;
export type TerminalJobStatus = Exclude<JobStatus, ActiveJobStatus>;
export type PublicJobStatus = (typeof PUBLIC_JOB_STATUS)[keyof typeof PUBLIC_JOB_STATUS];
export type PublicActiveJobStatus = typeof PUBLIC_JOB_STATUS.pending | typeof PUBLIC_JOB_STATUS.inProgress;
export type JobType = "ocr" | "advising_extraction" | "advising_schedule";

export type PublicJob = {
  id: string;
  type: JobType;
  status: PublicJobStatus;
  /** Present only when the value is known without estimating. */
  progress?: number;
};

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

export function isPublicActiveJobStatus(value: unknown): value is PublicActiveJobStatus {
  return value === PUBLIC_JOB_STATUS.pending || value === PUBLIC_JOB_STATUS.inProgress;
}

/** Maps the persisted lifecycle (including cancelled/superseded) to the four public outcomes. */
export function toPublicJobStatus(value: unknown): PublicJobStatus | null {
  switch (value) {
    case JOB_STATUS.pending:
      return PUBLIC_JOB_STATUS.pending;
    case JOB_STATUS.inProgress:
      return PUBLIC_JOB_STATUS.inProgress;
    case JOB_STATUS.completed:
      return PUBLIC_JOB_STATUS.completed;
    case JOB_STATUS.failed:
    case JOB_STATUS.cancelled:
    case JOB_STATUS.superseded:
    case "stale":
      return PUBLIC_JOB_STATUS.failed;
    default:
      return null;
  }
}

export function publicJobProgress(status: PublicJobStatus): number | undefined {
  if (status === PUBLIC_JOB_STATUS.pending) return 0;
  if (status === PUBLIC_JOB_STATUS.completed) return 100;
  return undefined;
}

export function toPublicJob(
  id: string,
  type: JobType,
  persistedStatus: unknown,
  hasStarted = false
): PublicJob | null {
  // Workers requeue a failed *attempt* as "queued". It is not a newly
  // accepted job, though, so the public lifecycle stays monotonic while the
  // retry waits for its next lease.
  const status = persistedStatus === JOB_STATUS.pending && hasStarted
    ? PUBLIC_JOB_STATUS.inProgress
    : toPublicJobStatus(persistedStatus);
  if (!status) return null;
  const progress = publicJobProgress(status);
  return progress === undefined ? { id, type, status } : { id, type, status, progress };
}
