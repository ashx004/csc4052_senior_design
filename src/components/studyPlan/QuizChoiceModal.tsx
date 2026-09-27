"use client";

import { X } from "lucide-react";

export interface QuizChoice {
  id: string;
  name: string;
}

interface QuizChoiceModalProps {
  open: boolean;
  quizzes: QuizChoice[];
  onClose: () => void;
  onSelect: (quizId: string) => void;
}

export default function QuizChoiceModal({ open, quizzes, onClose, onSelect }: QuizChoiceModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-bg-container p-6 shadow-xl"
        role="dialog"
        aria-labelledby="quiz-choice-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="quiz-choice-title" className="text-base font-bold text-[#1a1a2e]">
            Choose another quiz
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-warm hover:text-text-main"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        {quizzes.length === 0 ? (
          <p className="text-sm text-text-muted">No other quizzes for this document.</p>
        ) : (
          <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {quizzes.map((quiz) => (
              <li key={quiz.id}>
                <button
                  type="button"
                  onClick={() => onSelect(quiz.id)}
                  className="w-full rounded-xl border border-border-light px-4 py-3 text-left text-sm font-semibold text-[#1a1a2e] transition-colors hover:bg-bg-warm"
                >
                  {quiz.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
