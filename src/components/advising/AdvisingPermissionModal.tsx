"use client";

interface AdvisingPermissionModalProps {
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onClose: () => void;
}

export default function AdvisingPermissionModal({
  isOpen,
  onAccept,
  onDecline,
  onClose,
}: AdvisingPermissionModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" >

      <div
        className="relative w-full max-w-md rounded-xl border border-[#d8d3ca] bg-[#fbfaf8] 
        p-6 text-[#1f2933] shadow-xl dark:border-gray-700 dark:bg-[#202020] dark:text-gray-100" >

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-3 text-xl text-gray-500 hover:text-black
          dark:text-gray-400 dark:hover:text-white"

          aria-label="Close advising popup" >
          ×
        </button>

        <h2 className="pr-8 text-xl font-semibold">
          Advising Documents
        </h2>

        <p
          className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300" >
          Studora uses your transcript and curriculum sheet to identify your
          completed courses and remaining degree requirements.
        </p>

        <p
          className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200" >
          Do you mind uploading your transcript and curriculum sheet?
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={onAccept}
            className="rounded-lg bg-[#b08957] px-4 py-2.5 text-sm font-medium
            text-white transition hover:bg-[#9c7849]" >
            I’m fine with uploading them
          </button>

          <button
            type="button"
            onClick={onDecline}
            className="rounded-lg border border-[#d8d3ca] px-4 py-2.5 text-sm font-medium
            transition hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700" >
            I don’t want to upload them
          </button>
        </div>
      </div>
    </div>
  );
}