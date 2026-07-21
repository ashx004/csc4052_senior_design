"use client";

import AnswerOption from "./AnswerOption";

interface QuizQuestion {
  id: string;
  type: "multiple_choice" | "true_false";
  question: string;
  options: string[];
  correctAnswer: string;
}

interface QuestionCardProps {
  question: QuizQuestion;
  questionNumber: number;
  selectedAnswer: string | undefined;
  onSelect: (answer: string) => void;
  mode: "taking" | "results";
}

export default function QuestionCard({
  question,
  questionNumber,
  selectedAnswer,
  onSelect,
  mode,
}: QuestionCardProps) {
  const isResults = mode === "results";
  const isCorrect = selectedAnswer === question.correctAnswer;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Question {questionNumber}
      </p>
      <h3 className="mb-4 text-base font-bold text-[#1a1a2e]">{question.question}</h3>

      {isResults && (
        <p
          className={`mb-3 text-xs font-semibold ${
            isCorrect ? "text-emerald-600" : "text-orange-500"
          }`}
        >
          {isCorrect ? "You're doing great!" : "Not quite, you're still learning!"}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {question.options.map((option) => (
          <AnswerOption
            key={option}
            option={option}
            isSelected={selectedAnswer === option}
            isCorrect={option === question.correctAnswer}
            isUserAnswer={selectedAnswer === option}
            mode={mode}
            onClick={() => onSelect(option)}
          />
        ))}
      </div>
    </div>
  );
}
