"use client";

interface SkipConfirmModalProps {
  open: boolean;
  taskTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SkipConfirmModal({
  open,
  taskTitle,
  onConfirm,
  onCancel,
}: SkipConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-2xl bg-bg-container p-6 shadow-xl ring-1 ring-border-light">
        <h3 className="text-lg font-semibold text-text-main">Skip task?</h3>
        <p className="mt-2 text-sm text-text-muted">
          Your progress on <strong>{taskTitle}</strong> will be saved.
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
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
