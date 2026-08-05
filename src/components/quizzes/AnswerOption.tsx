"use client";

import { Check, X } from "lucide-react";

interface AnswerOptionProps {
  option: string;
  isSelected: boolean;
  isCorrect?: boolean;
  isUserAnswer?: boolean;
  mode: "taking" | "results";
  onClick: () => void;
}

export default function AnswerOption({
  option,
  isSelected,
  isCorrect = false,
  isUserAnswer = false,
  mode,
  onClick,
}: AnswerOptionProps) {
  if (mode === "taking") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex items-center justify-center rounded-xl border px-4 py-3 text-center text-sm font-medium transition-colors ${
          isSelected
            ? "border-[#1a1a2e] bg-[#1a1a2e]/5 text-[#1a1a2e]"
            : "border-border-light text-text-muted hover:border-border-hover hover:bg-bg-warm"
        }`}
      >
        {option}
      </button>
    );
  }

  // Results mode — clicking is disabled; render pure state
  const userPickedCorrectly = isUserAnswer && isCorrect;
  const userPickedWrongly = isUserAnswer && !isCorrect;
  const correctButNotPicked = !isUserAnswer && isCorrect;

  let stateClasses = "border-border-light bg-bg-container text-text-muted";
  let icon: React.ReactNode = null;

  if (userPickedCorrectly) {
    stateClasses = "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
    icon = <Check size={16} className="shrink-0 text-emerald-600 dark:text-emerald-300" />;
  } else if (userPickedWrongly) {
    stateClasses = "border-red-400 bg-red-50 text-red-600 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300";
    icon = <X size={16} className="shrink-0 text-red-500 dark:text-red-300" />;
  } else if (correctButNotPicked) {
    stateClasses = "border-dashed border-emerald-500 bg-bg-container text-emerald-700 dark:border-emerald-700 dark:text-emerald-300";
    icon = <Check size={16} className="shrink-0 text-emerald-600 dark:text-emerald-300" />;
  }

  return (
    <div
      className={`flex cursor-default items-center justify-center gap-2 rounded-xl border px-4 py-3 text-center text-sm font-medium ${stateClasses}`}
    >
      {icon}
      <span>{option}</span>
    </div>
  );
}
