"use client";

interface ExistingDocumentsModalProps {
  isOpen: boolean;
  onUseExisting: () => void;
  onReplace: () => void;
  onClose: () => void;
}

export default function ExistingDocumentsModal({
  isOpen,
  onUseExisting,
  onReplace,
  onClose,
}: ExistingDocumentsModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="relative w-full max-w-md rounded-xl border border-border-light bg-bg-container p-6 text-text-main shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-3 text-xl text-text-muted hover:text-text-main"
          aria-label="Close popup"
        >
          ×
        </button>

        <h2 className="pr-8 text-xl font-semibold">
          Advising documents found
        </h2>

        <p className="mt-3 text-sm leading-6 text-text-muted">
          You have already uploaded a transcript and curriculum
          sheet. Would you like to use those documents or replace
          them?
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={onUseExisting}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover" >
            Use previously uploaded documents.
          </button>

          <button
            type="button"
            onClick={onReplace}
            className="rounded-lg border border-border-light px-4 py-2.5 text-sm font-medium hover:bg-bg-warm" >
            Replace my documents.
          </button>
        </div>
      </div>
    </div>
  );
}