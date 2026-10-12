import { Clock3, Loader2 } from "lucide-react";
import { JOB_STATUS, type ActiveJobStatus } from "@/src/library/jobStatus";

export type JobProgressKind = "ocr" | "advising";

const JOB_LABELS: Record<JobProgressKind, string> = {
  ocr: "OCR transcription",
  advising: "Advising request",
};

const JOB_DESCRIPTIONS: Record<JobProgressKind, Record<ActiveJobStatus, string>> = {
  ocr: {
    [JOB_STATUS.pending]: "Your transcription is waiting to start.",
    [JOB_STATUS.inProgress]: "Your transcription is being processed.",
  },
  advising: {
    [JOB_STATUS.pending]: "Your advising request is waiting to start.",
    [JOB_STATUS.inProgress]: "Your advising request is being processed.",
  },
};

/**
 * An indeterminate progress display for a queued or processing background job.
 * OCR and Advising jobs do not yet report an honest numeric completion value,
 * so this deliberately communicates state rather than a fabricated percentage.
 */
export default function JobProgressIndicator({
  kind,
  status,
  className = "",
}: {
  kind: JobProgressKind;
  status: ActiveJobStatus;
  className?: string;
}) {
  const isPending = status === JOB_STATUS.pending;
  const label = JOB_LABELS[kind];
  const stateLabel = isPending ? "Waiting to start" : "Processing";
  const description = JOB_DESCRIPTIONS[kind][status];

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
        </div>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-warm"
        role="progressbar"
        aria-label={`${label} progress`}
        aria-valuetext={stateLabel}
      >
        <div className="h-full w-2/5 animate-pulse rounded-full bg-primary" />
      </div>
    </section>
  );
}
