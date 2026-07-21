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
            : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
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

  let stateClasses = "border-gray-200 bg-white text-gray-400";
  let icon: React.ReactNode = null;

  if (userPickedCorrectly) {
    stateClasses = "border-emerald-500 bg-emerald-50 text-emerald-700";
    icon = <Check size={16} className="shrink-0 text-emerald-600" />;
  } else if (userPickedWrongly) {
    stateClasses = "border-red-400 bg-red-50 text-red-600";
    icon = <X size={16} className="shrink-0 text-red-500" />;
  } else if (correctButNotPicked) {
    stateClasses = "border-dashed border-emerald-500 bg-white text-emerald-700";
    icon = <Check size={16} className="shrink-0 text-emerald-600" />;
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
