"use client";

interface AdvisingPermissionModalProps {
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export default function AdvisingPermissionModal({
  isOpen,
  onAccept,
  onDecline,
}: AdvisingPermissionModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-xl border border-border-light bg-bg-container p-6 text-text-main shadow-xl">
        <h2 className="text-xl font-semibold">Advising Documents</h2>

        <p className="mt-3 text-sm leading-6 text-text-muted" data-tutorial="advising-setup-why">
          Catalyst uses your transcript and curriculum sheet to identify your
          completed courses and remaining degree requirements.
        </p>

        <p className="mt-3 text-sm font-medium text-text-main">
          Do you mind uploading your transcript and curriculum sheet?
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={onAccept}
            data-tutorial="advising-setup-accept"
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition hover:bg-primary-hover"
          >
            I&apos;m fine with uploading them
          </button>

          <button
            type="button"
            onClick={onDecline}
            data-tutorial="advising-setup-decline"
            className="rounded-lg border border-border-light px-4 py-2.5 text-sm font-medium transition hover:bg-bg-warm"
          >
            I don&apos;t want to upload them
          </button>
        </div>
      </div>
    </div>
  );
}
