"use client";

import Link from "next/link";
import type { FlashcardNextStep } from "@/src/library/studyPlan/nextStudyActivity";

interface NextStepGuidanceProps {
  courseId: string;
  resourceId: string;
  resourceName: string;
  step: FlashcardNextStep;
  onLater: () => void;
}

const primaryButtonClass =
  "rounded-xl bg-[#1a1a2e] px-4 py-2 text-sm font-semibold text-text-inverse transition-colors hover:bg-[#2a2a3e]";
const secondaryButtonClass =
  "rounded-xl border border-border-light px-4 py-2 text-sm font-semibold text-[#1a1a2e] transition-colors hover:bg-bg-warm";

export default function NextStepGuidance({
  courseId,
  resourceId,
  resourceName,
  step,
  onLater,
}: NextStepGuidanceProps) {
  const href =
    step.action === "open_flashcards"
      ? `/courses/${courseId}/flashcards?setId=${encodeURIComponent(step.setId)}`
      : `/courses/${courseId}/flashcards?docId=${encodeURIComponent(resourceId)}&docName=${encodeURIComponent(resourceName)}`;
  const actionLabel = step.action === "open_flashcards" ? "Open flashcards" : "Create flashcards";
  const message =
    step.action === "open_flashcards"
      ? "Flashcards for this document are ready whenever you want a short review."
      : "You can make flashcards from this document whenever you want a short review.";

  return (
    <div className="border-t border-border-light bg-bg-main px-4 py-4" role="region" aria-label="Next step">
      <h3 className="text-sm font-semibold text-text-main">You finished this reading</h3>
      <p className="mt-1 text-sm text-text-muted">{message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={href} className={primaryButtonClass}>
          {actionLabel}
        </Link>
        <button type="button" onClick={onLater} className={secondaryButtonClass}>
          Later
        </button>
      </div>
    </div>
  );
}
