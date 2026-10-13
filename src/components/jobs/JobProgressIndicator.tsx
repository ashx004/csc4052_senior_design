import { Clock3, Loader2 } from "lucide-react";
import { JOB_STATUS, PUBLIC_JOB_STATUS, type ActiveJobStatus, type PublicActiveJobStatus } from "@/src/library/jobStatus";

export type JobProgressKind = "ocr" | "advising";

const JOB_LABELS: Record<JobProgressKind, string> = {
  ocr: "OCR transcription",
  advising: "Advising request",
};

type ProgressStatus = ActiveJobStatus | PublicActiveJobStatus;

function isPendingStatus(status: ProgressStatus) {
  return status === JOB_STATUS.pending || status === PUBLIC_JOB_STATUS.pending;
}

function descriptionFor(kind: JobProgressKind, status: ProgressStatus) {
  const pending = isPendingStatus(status);
  if (kind === "ocr") return pending ? "Your transcription is waiting to start." : "Your transcription is being processed.";
  return pending ? "Your advising request is waiting to start." : "Your advising request is being processed.";
}

/**
 * An indeterminate progress display for a queued or processing background job.
 * OCR and Advising jobs do not yet report an honest numeric completion value,
 * so this deliberately communicates state rather than a fabricated percentage.
 */
export default function JobProgressIndicator({
  kind,
  status,
  progress,
  className = "",
}: {
  kind: JobProgressKind;
  status: ProgressStatus;
  progress?: number;
  className?: string;
}) {
  const isPending = isPendingStatus(status);
  const label = JOB_LABELS[kind];
  const stateLabel = isPending ? "Waiting to start" : "Processing";
  const description = descriptionFor(kind, status);
  const determinateProgress = typeof progress === "number" && Number.isFinite(progress)
    ? Math.max(0, Math.min(100, Math.round(progress)))
    : undefined;
  const progressText = determinateProgress === undefined
    ? stateLabel
    : `${stateLabel}, ${determinateProgress}% complete`;

  return (
    <section
      className={`rounded-lg border border-border-light bg-bg-container px-4 py-3 ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        {isPending ? (
          <Clock3 size={18} className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
        ) : (
          <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-primary" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-main">
            {label}: {stateLabel}
          </p>
          <p className="mt-0.5 text-sm text-text-muted">{description}</p>
          {determinateProgress !== undefined && <p className="mt-0.5 text-xs text-text-muted">{determinateProgress}% complete</p>}
        </div>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-warm"
        role="progressbar"
        aria-label={`${label} progress`}
        aria-valuetext={progressText}
        aria-valuemin={determinateProgress === undefined ? undefined : 0}
        aria-valuemax={determinateProgress === undefined ? undefined : 100}
        aria-valuenow={determinateProgress}
      >
        <div
          className={`h-full rounded-full bg-primary ${determinateProgress === undefined ? "w-2/5 animate-pulse" : ""}`}
          style={determinateProgress === undefined ? undefined : { width: `${determinateProgress}%` }}
        />
      </div>
    </section>
  );
}
