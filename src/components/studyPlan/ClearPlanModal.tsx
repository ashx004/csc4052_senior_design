"use client";

interface ClearPlanModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ClearPlanModal({
  open,
  onConfirm,
  onCancel,
}: ClearPlanModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-2xl bg-bg-container p-6 shadow-xl ring-1 ring-border-light">
        <h3 className="text-lg font-semibold text-text-main">
          Clear today&apos;s plan?
        </h3>
        <p className="mt-2 text-sm text-text-muted">
          Your progress on started tasks will be saved.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-text-muted hover:text-text-main"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
          >
            Clear plan
          </button>
        </div>
      </div>
    </div>
  );
}
