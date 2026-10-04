"use client";

import { resolveQuizSuggestionView } from "@/src/library/studyPlan/quizSuggestionView";
import type { MissedQuestionsSuggestion } from "@/src/library/studyPlan/types";

interface LearningSuggestionCardProps {
  suggestion: MissedQuestionsSuggestion & { id: string };
  courseCode: string;
  courseName: string;
  highlighted?: boolean;
  busy?: boolean;
  onAdd: () => void;
  onDismiss: () => void;
}

const primaryButtonClass =
  "rounded-xl bg-[#1a1a2e] px-4 py-2 text-sm font-semibold text-text-inverse transition-colors hover:bg-[#2a2a3e] disabled:opacity-60";
const secondaryButtonClass =
  "rounded-xl border border-border-light px-4 py-2 text-sm font-semibold text-[#1a1a2e] transition-colors hover:bg-bg-warm disabled:opacity-60";

export default function LearningSuggestionCard({
  suggestion,
  courseCode,
  courseName,
  highlighted = false,
  busy = false,
  onAdd,
  onDismiss,
}: LearningSuggestionCardProps) {
  const view = resolveQuizSuggestionView(suggestion);
  if (!view || view.primaryAction === "unavailable") return null;

  const count = suggestion.questionIds.length;
  const noun = count === 1 ? "question" : "questions";
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
      <h3 className="mt-1 text-base font-bold text-[#1a1a2e]">Review missed questions</h3>
      <p className="mt-1 text-sm text-text-muted">
        {count} {noun} from {courseName || courseLabel} can be practiced again whenever you have time.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={onAdd} disabled={busy} className={primaryButtonClass}>
          Add to plan
        </button>
        <button type="button" onClick={onDismiss} disabled={busy} className={secondaryButtonClass}>
          Dismiss
        </button>
      </div>
    </article>
  );
}
