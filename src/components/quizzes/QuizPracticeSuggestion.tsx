"use client";

import {
  resolveQuizSuggestionView,
  type QuizSuggestionView,
} from "@/src/library/studyPlan/quizSuggestionView";
import { conceptLabelFromQuizName } from "@/src/library/studyPlan/targetedPractice";
import { weakConceptReason } from "@/src/library/studyPlan/weakConcept";
import type { MissedQuestionsSuggestion } from "@/src/library/studyPlan/types";

interface QuizPracticeSuggestionProps {
  suggestion: MissedQuestionsSuggestion | null;
  quizName: string;
  onAdd: () => void;
  onLater: () => void;
  onOpenDocument: () => void;
  onCreateQuiz: () => void;
  onPractice: () => void;
  practicing?: boolean;
  practiceError?: string | null;
  openDocumentLabel: string;
}

const primaryButtonClass =
  "rounded-xl bg-[#1a1a2e] px-5 py-2.5 text-sm font-semibold text-text-inverse transition-colors hover:bg-[#2a2a3e]";
const secondaryButtonClass =
  "rounded-xl border border-border-light px-5 py-2.5 text-sm font-semibold text-[#1a1a2e] transition-colors hover:bg-bg-warm";

function SuggestionActions({
  view,
  onAdd,
  onLater,
  onOpenDocument,
  onCreateQuiz,
  onPractice,
  practicing,
  openDocumentLabel,
}: {
  view: QuizSuggestionView;
  onAdd: () => void;
  onLater: () => void;
  onOpenDocument: () => void;
  onCreateQuiz: () => void;
  onPractice: () => void;
  practicing: boolean;
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
      <button type="button" onClick={onAdd} className={primaryButtonClass}>
        Add to Plan
      </button>
      <button type="button" onClick={onLater} className={secondaryButtonClass}>
        Later
      </button>
      <button
        type="button"
        onClick={onPractice}
        disabled={practicing}
        className={`${secondaryButtonClass} disabled:opacity-60`}
      >
        {practicing ? "Generating…" : "Practice this weak spot"}
      </button>
    </div>
  );
}

export default function QuizPracticeSuggestion({
  suggestion,
  quizName,
  onAdd,
  onLater,
  onOpenDocument,
  onCreateQuiz,
  onPractice,
  practicing = false,
  practiceError = null,
  openDocumentLabel,
}: QuizPracticeSuggestionProps) {
  const view = resolveQuizSuggestionView(suggestion);
  if (!view) return null;

  const { reason } = weakConceptReason({
    conceptLabel: conceptLabelFromQuizName(quizName) || quizName,
    questionIds: suggestion?.questionIds ?? [],
    questionFailureCounts: suggestion?.questionFailureCounts ?? {},
  });

  return (
    <section className="mt-4 rounded-2xl border border-border-light bg-bg-container p-6 text-left shadow-sm">
      {view.primaryAction === "unavailable" ? (
        <p className="text-sm text-text-main">These practice questions are no longer available.</p>
      ) : (
        <p className="text-lg font-bold text-[#1a1a2e]">{reason}</p>
      )}
      <SuggestionActions
        view={view}
        onAdd={onAdd}
        onLater={onLater}
        onOpenDocument={onOpenDocument}
        onCreateQuiz={onCreateQuiz}
        onPractice={onPractice}
        practicing={practicing}
        openDocumentLabel={openDocumentLabel}
      />
      {practiceError && view.primaryAction !== "unavailable" && (
        <p className="mt-2 text-sm text-red-600">{practiceError}</p>
      )}
    </section>
  );
}
