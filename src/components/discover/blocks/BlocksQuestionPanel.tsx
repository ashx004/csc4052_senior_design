"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import AnswerOption from "@/src/components/quizzes/AnswerOption";
import MatchingQuestionGroup from "@/src/components/quizzes/MatchingQuestionGroup";
import { isMatchingQuestion, isSingleQuestion, MAX_HEARTS } from "@/src/library/discover/blocksTypes";
import type { BlocksQuestion } from "@/src/library/discover/blocksTypes";

interface BlocksQuestionPanelProps {
  question: BlocksQuestion;
  heartsRemaining: number;
  onCorrect: () => void;
  onSkip: () => void;
}

export default function BlocksQuestionPanel({ question, heartsRemaining, onCorrect, onSkip }: BlocksQuestionPanelProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [matchAnswers, setMatchAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  // A new question (after a skip, or the next round's question) always
  // starts fresh. Retrying the SAME wrong question does not reset this —
  // handleTryAgain flips `submitted` back to false without clearing answers,
  // so the player only has to fix what was wrong.
  useEffect(() => {
    setSelected(null);
    setMatchAnswers({});
    setSubmitted(false);
  }, [question.id]);

  const canSubmit = isSingleQuestion(question)
    ? selected !== null
    : isMatchingQuestion(question) && question.pairs.every((pair) => matchAnswers[pair.id]);

  const handleSubmit = () => {
    if (!canSubmit) return;

    const isCorrect = isSingleQuestion(question)
      ? selected === question.correctAnswer
      : isMatchingQuestion(question) && question.pairs.every((pair) => matchAnswers[pair.id] === pair.definition);

    if (isCorrect) {
      onCorrect();
      return;
    }
    setSubmitted(true);
  };

  const mode = submitted ? "results" : "taking";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border-light bg-bg-container p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          {question.sourceCourse} · {question.sourceSet}
        </p>
        <div className="flex items-center gap-1" aria-label={`${heartsRemaining} skips remaining`}>
          {Array.from({ length: MAX_HEARTS }, (_, i) => (
            <Heart key={i} size={14} className={i < heartsRemaining ? "fill-rose-400 text-rose-400" : "text-border-light"} />
          ))}
        </div>
      </div>

      {isSingleQuestion(question) && (
        <>
          <h3 className="text-base font-bold text-text-main">{question.question}</h3>
          <div className="grid grid-cols-1 gap-2">
            {question.options.map((option, index) => (
              <AnswerOption
                key={`${index}-${option}`}
                option={option}
                isSelected={selected === option}
                isCorrect={option === question.correctAnswer}
                isUserAnswer={selected === option}
                mode={mode}
                onClick={() => !submitted && setSelected(option)}
              />
            ))}
          </div>
        </>
      )}

      {isMatchingQuestion(question) && (
        <MatchingQuestionGroup
          questions={question.pairs.map((pair) => ({
            id: pair.id,
            question: pair.term,
            correctAnswer: pair.definition,
            options: question.pairs.map((p) => p.definition),
          }))}
          answers={matchAnswers}
          onSelect={(id, answer) => setMatchAnswers((prev) => ({ ...prev, [id]: answer }))}
          mode={mode}
        />
      )}

      {submitted && (
        <p className="text-xs font-medium text-red-500">Not quite — check the highlighted answer(s) and try again.</p>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSkip}
          disabled={heartsRemaining <= 0}
          className="rounded-lg border border-border-light px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-bg-warm disabled:cursor-not-allowed disabled:opacity-40"
        >
          Skip question
        </button>

        {submitted ? (
          <button
            type="button"
            onClick={() => setSubmitted(false)}
            className="rounded-lg bg-[#1a1a2e] px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#2a2a3e]"
          >
            Try Again
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-lg bg-[#1a1a2e] px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#2a2a3e] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Submit
          </button>
        )}
      </div>
    </div>
  );
}
