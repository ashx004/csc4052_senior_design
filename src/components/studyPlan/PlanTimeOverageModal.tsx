"use client";

interface PlanTimeOverageModalProps {
  open: boolean;
  overageMinutes: number;
  busy?: boolean;
  onAddAnyway: () => void;
  onLater: () => void;
}

export default function PlanTimeOverageModal({
  open,
  overageMinutes,
  busy = false,
  onAddAnyway,
  onLater,
}: PlanTimeOverageModalProps) {
  if (!open) return null;

  const minutesLabel = overageMinutes === 1 ? "minute" : "minutes";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-time-overage-title"
        className="w-full max-w-sm rounded-2xl bg-bg-container p-6 shadow-xl ring-1 ring-border-light"
      >
        <h3 id="plan-time-overage-title" className="text-lg font-semibold text-text-main">
          This runs past today’s time
        </h3>
        <p className="mt-2 text-sm text-text-muted">
          Adding this practice puts you about {overageMinutes} {minutesLabel} past the time you
          set aside today. You can add it anyway, or leave it for later.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onLater}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-medium text-text-muted hover:text-text-main disabled:opacity-60"
          >
            Later
          </button>
          <button
            type="button"
            onClick={onAddAnyway}
            disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
          >
            Add anyway
          </button>
        </div>
      </div>
    </div>
  );
}
