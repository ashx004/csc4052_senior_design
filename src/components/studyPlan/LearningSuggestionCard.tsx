"use client";

import { resolveQuizSuggestionView } from "@/src/library/studyPlan/quizSuggestionView";
import { weakConceptReason } from "@/src/library/studyPlan/weakConcept";
import type { MissedQuestionsSuggestion } from "@/src/library/studyPlan/types";

interface LearningSuggestionCardProps {
  suggestion: MissedQuestionsSuggestion & { id: string };
  courseCode: string;
  courseName: string;
  conceptLabel: string;
  highlighted?: boolean;
  busy?: boolean;
  onAdd: () => void;
  onDismiss: () => void;
  onPractice: () => void;
  practicing?: boolean;
  practiceError?: string | null;
  practiceDisabled?: boolean;
}

const primaryButtonClass =
  "rounded-xl bg-[#1a1a2e] px-4 py-2 text-sm font-semibold text-text-inverse transition-colors hover:bg-[#2a2a3e] disabled:opacity-60";
const secondaryButtonClass =
  "rounded-xl border border-border-light px-4 py-2 text-sm font-semibold text-[#1a1a2e] transition-colors hover:bg-bg-warm disabled:opacity-60";

export default function LearningSuggestionCard({
  suggestion,
  courseCode,
  courseName,
  conceptLabel,
  highlighted = false,
  busy = false,
  onAdd,
  onDismiss,
  onPractice,
  practicing = false,
  practiceError = null,
  practiceDisabled = false,
}: LearningSuggestionCardProps) {
  const view = resolveQuizSuggestionView(suggestion);
  if (!view || view.primaryAction === "unavailable") return null;

  const { reason } = weakConceptReason({
    conceptLabel,
    questionIds: suggestion.questionIds,
    questionFailureCounts: suggestion.questionFailureCounts,
  });
  const courseLabel = courseCode || courseName;

  return (
    <article
      id={`learning-suggestion-${suggestion.id}`}
      className={`rounded-2xl border bg-bg-container p-5 text-left shadow-sm ${
        highlighted ? "border-navy ring-2 ring-navy" : "border-border-light"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brown-label">
        {courseLabel}
      </p>
      <h3 className="mt-1 text-base font-bold text-[#1a1a2e]">{reason}</h3>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={onAdd} disabled={busy} className={primaryButtonClass}>
          Add to plan
        </button>
        <button type="button" onClick={onDismiss} disabled={busy} className={secondaryButtonClass}>
          Dismiss
        </button>
        <button
          type="button"
          onClick={onPractice}
          disabled={practicing || busy || practiceDisabled}
          className={secondaryButtonClass}
        >
          {practicing ? "Generating…" : "Practice this weak spot"}
        </button>
      </div>
      {practiceError && <p className="mt-2 text-sm text-red-600">{practiceError}</p>}
    </article>
  );
}
