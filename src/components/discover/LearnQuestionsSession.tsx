"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, X, RotateCcw } from "lucide-react";
import type { LearnQuestion } from "@/src/library/discover/types";

interface LearnQuestionsSessionProps {
  questions: LearnQuestion[];
  onStateChange?: (state: {
    currentQuestion: LearnQuestion;
    currentIndex: number;
    totalQuestions: number;
    selectedAnswer: string | null;
    isCorrect: boolean | null;
    sessionScore: { answered: number; correct: number };
  }) => void;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Entirely in-memory — this component performs NO Firestore writes. The
// questions it receives were either reused from the student's own existing
// quiz sets, or generated session-only by Ollama; either way nothing here
// is saved, published, indexed, or added to Recent Quizzes.
export default function LearnQuestionsSession({ questions, onStateChange }: LearnQuestionsSessionProps) {
  const [order, setOrder] = useState<LearnQuestion[]>(() => shuffle(questions));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { selected: string; correct: boolean }>>({});
  // Tracks which questions have had an answer selected on the CURRENT visit —
  // drives whether feedback is shown. Revisiting via Previous removes the
  // question from this set so it appears unanswered again, even though its
  // stored answer (for the results summary) is untouched.
  const [revealedQuestions, setRevealedQuestions] = useState<Set<string>>(new Set());
  const [sessionComplete, setSessionComplete] = useState(false);

  const current = order[currentIndex];
  const currentAnswer = current ? answers[current.id] : undefined;
  const isRevealed = current ? revealedQuestions.has(current.id) : false;
  const isLastQuestion = currentIndex === order.length - 1;

  const results = useMemo(() => {
    const correctCount = order.reduce((count, q) => (answers[q.id]?.correct ? count + 1 : count), 0);
    return { correctCount, total: order.length };
  }, [order, answers]);

  // Reports the currently visible question's state to the parent (e.g. the
  // Discover page's Catalyst AI panel) — mirrors what's on screen, so a
  // revisited-via-Previous question reports as unanswered even though its
  // stored answer survives for the results summary.
  useEffect(() => {
    if (!onStateChange || !current) return;
    onStateChange({
      currentQuestion: current,
      currentIndex,
      totalQuestions: order.length,
      selectedAnswer: isRevealed ? currentAnswer?.selected ?? null : null,
      isCorrect: isRevealed ? currentAnswer?.correct ?? null : null,
      sessionScore: { answered: Object.keys(answers).length, correct: results.correctCount },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, answers, revealedQuestions]);

  const handleSelect = (answer: string) => {
    if (!current) return;
    setAnswers((prev) => ({
      ...prev,
      [current.id]: { selected: answer, correct: answer === current.correctAnswer },
    }));
    setRevealedQuestions((prev) => new Set(prev).add(current.id));
  };

  const handleNext = () => {
    if (isLastQuestion) {
      setSessionComplete(true);
      return;
    }
    setCurrentIndex((i) => i + 1);
  };

  const handlePrevious = () => {
    if (currentIndex === 0) return;
    const previousQuestion = order[currentIndex - 1];
    setRevealedQuestions((prev) => {
      const next = new Set(prev);
      next.delete(previousQuestion.id);
      return next;
    });
    setCurrentIndex((i) => i - 1);
  };

  const handleTryAgain = () => {
    setOrder(shuffle(questions));
    setCurrentIndex(0);
    setAnswers({});
    setRevealedQuestions(new Set());
    setSessionComplete(false);
  };

  if (order.length === 0) return null;

  if (sessionComplete) {
    return (
      <div className="flex flex-col gap-3 max-w-xl mx-auto">
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Session complete</p>
          <p className="mt-1 text-xl font-bold text-[#1a1a2e]">
            {results.correctCount}/{results.total}
          </p>
          <button
            onClick={handleTryAgain}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#1a1a2e] px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#2a2a3e]"
          >
            <RotateCcw size={12} />
            Try Again
          </button>
        </div>

        {/* Results grouped by course */}
        <div className="flex flex-col gap-2">
          {Object.entries(groupByCourse(order, answers)).map(([courseName, items]) => (
            <div key={courseName} className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="mb-1 text-xs font-semibold uppercase text-gray-400">{courseName}</p>
              {items.map(({ question, result }) => (
                <div key={question.id} className="flex items-center justify-between py-1">
                  <p className="mr-2 truncate text-xs text-gray-700">{question.question}</p>
                  {result?.correct ? (
                    <Check size={12} className="shrink-0 text-emerald-500" />
                  ) : (
                    <X size={12} className="shrink-0 text-red-400" />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 max-w-xl mx-auto">
      {/* Compact question display */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="mb-1 text-xs text-gray-400">
          Question {currentIndex + 1} of {order.length} • {current.sourceCourse}
        </p>
        <p className="mb-3 text-sm font-semibold text-[#1a1a2e]">{current.question}</p>

        <div className="flex flex-col gap-2">
          {current.options.map((option) => {
            let optionStyle = "border-gray-200 hover:border-[#b08957] hover:bg-[#F5F0EB] cursor-pointer";

            if (isRevealed && currentAnswer) {
              if (option === current.correctAnswer) {
                optionStyle = "border-emerald-400 bg-emerald-50 text-emerald-800";
              } else if (option === currentAnswer.selected && !currentAnswer.correct) {
                optionStyle = "border-red-400 bg-red-50 text-red-700";
              } else {
                optionStyle = "border-gray-100 text-gray-400 cursor-default";
              }
            }

            return (
              <button
                key={option}
                onClick={() => handleSelect(option)}
                disabled={isRevealed}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${optionStyle}`}
              >
                {option}
              </button>
            );
          })}
        </div>

        {isRevealed && currentAnswer && !currentAnswer.correct && (
          <p className="mt-2 text-xs text-emerald-700">Correct: {current.correctAnswer}</p>
        )}
        {isRevealed && current.explanation && (
          <p className="mt-1 text-xs italic text-gray-500">{current.explanation}</p>
        )}
      </div>

      {/* Compact navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={handlePrevious}
          disabled={currentIndex === 0}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            currentIndex === 0
              ? "text-gray-300 cursor-not-allowed"
              : "text-[#1a1a2e] border border-gray-300 hover:bg-[#F5F0EB]"
          }`}
        >
          ← Previous
        </button>

        {isRevealed && (
          <button
            onClick={handleNext}
            className="rounded-lg bg-[#1a1a2e] px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#2a2a3e]"
          >
            {isLastQuestion ? "Finish" : "Next →"}
          </button>
        )}
      </div>
    </div>
  );
}

function groupByCourse(
  order: LearnQuestion[],
  answers: Record<string, { selected: string; correct: boolean }>
): Record<string, { question: LearnQuestion; result: { selected: string; correct: boolean } | undefined }[]> {
  const groups: Record<
    string,
    { question: LearnQuestion; result: { selected: string; correct: boolean } | undefined }[]
  > = {};

  for (const question of order) {
    const key = question.sourceCourse;
    if (!groups[key]) groups[key] = [];
    groups[key].push({ question, result: answers[question.id] });
  }

  return groups;
}
