"use client";

import Image from "next/image";
import { ArrowRight, X } from "lucide-react";

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
        className="w-full max-w-2xl rounded-[28px] bg-[#FFFDF9] p-6 shadow-2xl sm:p-8"
      >
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8B7B5E]">Study mode</p>
            <h2 className="mt-1 text-2xl font-bold text-[#252540]">How do you want to practice?</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-text-muted hover:text-text-main hover:bg-bg-warm transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-2 max-w-[calc(100%-2rem)] truncate text-sm text-[#8B7B5E]">Using <span className="font-semibold text-[#5E594B]">{documentName}</span></p>

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <button
            onClick={onSelectFlashcard}
            className="group overflow-hidden rounded-2xl border border-[#D8D5FF] bg-[#F0F0FF] text-left transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7774D6]"
          >
            <div className="flex h-36 items-center justify-center bg-[#DCDCFB]">
              <Image src="/illustrations/flashcards.svg" alt="" width={190} height={134} priority />
            </div>
            <div className="p-5">
              <p className="text-lg font-bold text-[#252540]">Flashcards</p>
              <p className="mt-1 text-sm leading-relaxed text-[#59597A]">Review key ideas at your own pace.</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#4E4B9E]">Start reviewing <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" /></span>
            </div>
          </button>

          <button
            onClick={onSelectQuiz}
            className="group overflow-hidden rounded-2xl border border-[#F4D0C5] bg-[#FFF1EC] text-left transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F29B7E]"
          >
            <div className="flex h-36 items-center justify-center bg-[#FFE0D5]">
              <Image src="/illustrations/quizzes.svg" alt="" width={190} height={134} priority />
            </div>
            <div className="p-5">
              <p className="text-lg font-bold text-[#252540]">Quizzes</p>
              <p className="mt-1 text-sm leading-relaxed text-[#6F5A54]">Test your understanding and spot gaps.</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#A84D35]">Take a quiz <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" /></span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
