"use client";

import { X } from "lucide-react";

interface LectureChoiceModalProps {
  open: boolean;
  documentName: string;
  onClose: () => void;
  onSelectFlashcard: () => void;
  onSelectQuiz: () => void;
}

export default function LectureChoiceModal({
  open,
  documentName,
  onClose,
  onSelectFlashcard,
  onSelectQuiz,
}: LectureChoiceModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-bg-container p-6 shadow-xl"
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-[#1a1a2e]">What do you want to make?</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-text-muted hover:text-text-main hover:bg-bg-warm transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-text-muted mb-5 truncate">{documentName}</p>

        <div className="flex flex-col gap-3">
          <button
            onClick={onSelectFlashcard}
            className="w-full rounded-xl bg-[#1a1a2e] px-5 py-4 text-sm font-semibold text-white hover:bg-[#2a2a3e] transition-colors"
          >
            Flashcard
          </button>

          <button
            onClick={onSelectQuiz}
            className="w-full rounded-xl border border-border-light px-5 py-4 text-sm font-semibold text-[#1a1a2e] hover:bg-bg-warm transition-colors"
          >
            Quizzes
          </button>
        </div>
      </div>
    </div>
  );
}
