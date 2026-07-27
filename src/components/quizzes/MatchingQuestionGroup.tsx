"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";

export interface MatchingQuestion {
  id: string;
  question: string;
  correctAnswer: string;
  options: string[];
}

interface MatchingQuestionGroupProps {
  questions: MatchingQuestion[];
  answers: Record<string, string>;
  onSelect: (questionId: string, answer: string) => void;
  mode: "taking" | "results";
}

export default function MatchingQuestionGroup({
  questions,
  answers,
  onSelect,
  mode,
}: MatchingQuestionGroupProps) {
  const [activeTermId, setActiveTermId] = useState<string | null>(null);
  const isResults = mode === "results";
  const definitions = questions[0]?.options ?? [];

  const handleTermClick = (termId: string) => {
    if (isResults) return;
    setActiveTermId(termId);
  };

  const handleDefinitionClick = (definition: string) => {
    if (isResults || !activeTermId) return;

    const previousOwner = questions.find(
      (q) => q.id !== activeTermId && answers[q.id] === definition
    );
    if (previousOwner) {
      onSelect(previousOwner.id, "");
    }
    onSelect(activeTermId, definition);
    setActiveTermId(null);
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Match each term to its definition
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Terms */}
        <div className="flex flex-col gap-2">
          {questions.map((q) => {
            const selected = answers[q.id];
            const isActive = activeTermId === q.id;
            const isCorrect = selected === q.correctAnswer;

            let stateClasses = "border-gray-200 hover:border-[#8B6914]";
            if (isResults) {
              stateClasses = isCorrect
                ? "border-emerald-400 bg-emerald-50"
                : "border-red-300 bg-red-50";
            } else if (isActive) {
              stateClasses = "border-[#1a1a2e] bg-[#F5F0EB]";
            } else if (selected) {
              stateClasses = "border-[#8B6914] bg-[#FBF7EF]";
            }

            return (
              <button
                key={q.id}
                type="button"
                onClick={() => handleTermClick(q.id)}
                disabled={isResults}
                className={`text-left rounded-xl border px-4 py-3 text-sm transition-colors ${stateClasses} disabled:cursor-default`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#1a1a2e]">{q.question}</span>
                  {isResults &&
                    (isCorrect ? (
                      <Check size={16} className="shrink-0 text-emerald-600" />
                    ) : (
                      <X size={16} className="shrink-0 text-red-500" />
                    ))}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {selected || "Tap, then choose a definition"}
                </p>
                {isResults && !isCorrect && (
                  <p className="mt-1 text-xs font-medium text-emerald-700">
                    Correct: {q.correctAnswer}
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {/* Definitions */}
        <div className="flex flex-col gap-2">
          {definitions.map((definition) => {
            const assignedTo = questions.find((q) => answers[q.id] === definition);
            const isUsed = Boolean(assignedTo);

            return (
              <button
                key={definition}
                type="button"
                onClick={() => handleDefinitionClick(definition)}
                disabled={isResults}
                className={`text-left rounded-xl border px-4 py-3 text-sm transition-colors ${
                  isUsed
                    ? "border-[#8B6914] bg-[#FBF7EF] text-[#1a1a2e]"
                    : "border-gray-200 text-gray-600 hover:border-[#8B6914]"
                } disabled:cursor-default disabled:opacity-70`}
              >
                {definition}
                {isUsed && assignedTo && (
                  <span className="ml-2 text-xs text-gray-400">→ {assignedTo.question}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
