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

/*
 * The classes are written completely instead of constructing names such as
 * `bg-${color}-50`, because Tailwind needs complete class names to detect
 * and generate them.
 */
const MATCH_COLORS = [
  "border-blue-500 bg-blue-50 ring-1 ring-blue-200",
  "border-violet-500 bg-violet-50 ring-1 ring-violet-200",
  "border-amber-500 bg-amber-50 ring-1 ring-amber-200",
] as const;

function getMatchColor(index: number): string {
  return MATCH_COLORS[index % MATCH_COLORS.length];
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

    /*
     * A definition can belong to only one term.
     * Remove its previous assignment before assigning it to the active term.
     */
    const previousOwner = questions.find(
      (question) =>
        question.id !== activeTermId &&
        answers[question.id] === definition
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Terms */}
        <div className="flex flex-col gap-2">
          {questions.map((question, questionIndex) => {
            const selectedAnswer = answers[question.id];
            const isActive = activeTermId === question.id;
            const isCorrect =
              selectedAnswer === question.correctAnswer;

            const pairColor = getMatchColor(questionIndex);

            let stateClasses =
              "border-gray-200 bg-white hover:border-[#8B6914]";

            /*
             * After a match is selected, keep the pair color visible.
             * In results mode, add a green or red outline for grading.
             */
            if (selectedAnswer) {
              stateClasses = pairColor;

              if (isResults) {
                stateClasses += isCorrect
                  ? " outline outline-2 outline-emerald-400"
                  : " outline outline-2 outline-red-400";
              } else if (isActive) {
                stateClasses +=
                  " outline outline-2 outline-[#1a1a2e]/30";
              }
            } else if (isActive) {
              stateClasses =
                "border-[#1a1a2e] bg-[#F5F0EB] ring-2 ring-[#1a1a2e]/20";
            } else if (isResults) {
              stateClasses =
                "border-red-300 bg-red-50 outline outline-2 outline-red-400";
            }

            return (
              <button
                key={question.id}
                type="button"
                onClick={() =>
                  handleTermClick(question.id)
                }
                disabled={isResults}
                className={`
                  rounded-xl border px-4 py-3 text-left text-sm
                  transition-colors
                  focus-visible:outline-none
                  focus-visible:ring-2
                  focus-visible:ring-[#1a1a2e]
                  focus-visible:ring-offset-2
                  disabled:cursor-default
                  ${stateClasses}
                `}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#1a1a2e]">
                    {question.question}
                  </span>

                  {isResults &&
                    (isCorrect ? (
                      <Check
                        size={18}
                        className="shrink-0 text-emerald-600"
                      />
                    ) : (
                      <X
                        size={18}
                        className="shrink-0 text-red-500"
                      />
                    ))}
                </div>

                <p className="mt-1 text-xs text-gray-600">
                  {selectedAnswer ||
                    "Tap, then choose a definition"}
                </p>

                {isResults && !isCorrect && (
                  <p className="mt-2 text-xs font-medium text-emerald-700">
                    Correct: {question.correctAnswer}
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {/* Definitions */}
        <div className="flex flex-col gap-2">
          {definitions.map((definition) => {
            const assignedTo = questions.find(
              (question) =>
                answers[question.id] === definition
            );

            const assignedIndex = assignedTo
              ? questions.findIndex(
                  (question) =>
                    question.id === assignedTo.id
                )
              : -1;

            const isUsed = Boolean(assignedTo);

            const isCorrectAssignment = assignedTo
              ? definition === assignedTo.correctAnswer
              : false;

            let stateClasses =
              "border-gray-200 bg-white text-gray-600 hover:border-[#8B6914]";

            if (assignedTo && assignedIndex >= 0) {
              /*
               * Use the same color as the term this definition
               * is currently matched with.
               */
              stateClasses = `${getMatchColor(
                assignedIndex
              )} text-[#1a1a2e]`;

              if (isResults) {
                stateClasses += isCorrectAssignment
                  ? " outline outline-2 outline-emerald-400"
                  : " outline outline-2 outline-red-400";
              }
            }

            return (
              <button
                key={definition}
                type="button"
                onClick={() =>
                  handleDefinitionClick(definition)
                }
                disabled={isResults}
                className={`
                  rounded-xl border px-4 py-3 text-left text-sm
                  transition-colors
                  focus-visible:outline-none
                  focus-visible:ring-2
                  focus-visible:ring-[#1a1a2e]
                  focus-visible:ring-offset-2
                  disabled:cursor-default
                  ${stateClasses}
                `}
              >
                <span>{definition}</span>

                {isUsed && assignedTo && (
                  <span className="ml-2 text-xs text-gray-500">
                    → {assignedTo.question}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}