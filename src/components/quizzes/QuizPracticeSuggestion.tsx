"use client";

import {
  resolveQuizSuggestionView,
  type QuizSuggestionView,
} from "@/src/library/studyPlan/quizSuggestionView";
import type { MissedQuestionsSuggestion } from "@/src/library/studyPlan/types";

interface QuizPracticeSuggestionProps {
  suggestion: MissedQuestionsSuggestion | null;
  quizName: string;
  missedCount: number;
  onAdd: () => void;
  onView: () => void;
  onLater: () => void;
  onOpenDocument: () => void;
  onCreateQuiz: () => void;
  openDocumentLabel: string;
}

const primaryButtonClass =
  "rounded-xl bg-[#1a1a2e] px-5 py-2.5 text-sm font-semibold text-text-inverse transition-colors hover:bg-[#2a2a3e]";
const secondaryButtonClass =
  "rounded-xl border border-border-light px-5 py-2.5 text-sm font-semibold text-[#1a1a2e] transition-colors hover:bg-bg-warm";

function practiceHeading(count: number): string {
  const noun = count === 1 ? "question needs" : "questions need";
  return `${count} ${noun} more practice`;
}

function SuggestionActions({
  view,
  onAdd,
  onView,
  onLater,
  onOpenDocument,
  onCreateQuiz,
  openDocumentLabel,
}: {
  view: QuizSuggestionView;
  onAdd: () => void;
  onView: () => void;
  onLater: () => void;
  onOpenDocument: () => void;
  onCreateQuiz: () => void;
  openDocumentLabel: string;
}) {
  if (view.primaryAction === "unavailable") {
    return (
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={onOpenDocument} className={secondaryButtonClass}>
          {openDocumentLabel}
        </button>
        <button type="button" onClick={onCreateQuiz} className={secondaryButtonClass}>
          Create quiz
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {view.primaryAction === "add" ? (
        <button type="button" onClick={onAdd} className={primaryButtonClass}>
          Add to Plan
        </button>
      ) : (
        <button type="button" onClick={onView} className={primaryButtonClass}>
          View task
        </button>
      )}
      <button type="button" onClick={onLater} className={secondaryButtonClass}>
        Later
      </button>
    </div>
  );
}

export default function QuizPracticeSuggestion({
  suggestion,
  quizName,
  missedCount,
  onAdd,
  onView,
  onLater,
  onOpenDocument,
  onCreateQuiz,
  openDocumentLabel,
}: QuizPracticeSuggestionProps) {
  const view = resolveQuizSuggestionView(suggestion);
  if (!view) return null;

  return (
    <section className="mt-4 rounded-2xl border border-border-light bg-bg-container p-6 text-left shadow-sm">
      {view.primaryAction === "unavailable" ? (
        <p className="text-sm text-text-main">These practice questions are no longer available.</p>
      ) : (
        <>
          <p className="text-lg font-bold text-[#1a1a2e]">{practiceHeading(missedCount)}</p>
          <p className="mt-1 text-sm text-text-muted">
            Review the questions you missed from “{quizName}”.
          </p>
        </>
      )}
      <SuggestionActions
        view={view}
        onAdd={onAdd}
        onView={onView}
        onLater={onLater}
        onOpenDocument={onOpenDocument}
        onCreateQuiz={onCreateQuiz}
        openDocumentLabel={openDocumentLabel}
      />
    </section>
  );
}
