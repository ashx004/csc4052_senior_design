"use client";

import type { ReactNode } from "react";
import { Check, Minus, X } from "lucide-react";

/** Progress dots along the top of a runner: done (green/red), current, still to come. */
export function ProgressDots({ total, current, scores }: { total: number; current: number; scores: (number | undefined)[] }) {
  return (
    <div className="flex items-center gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={Math.min(current + 1, total)} aria-label={`Question ${Math.min(current + 1, total)} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const score = scores[i];
        const tone =
          score === undefined
            ? i === current
              ? "bg-primary"
              : "bg-border-light"
            : score >= 1
              ? "bg-emerald-500"
              : score > 0
                ? "bg-amber-400"
                : "bg-rose-400";
        return <span key={i} className={`h-2 flex-1 rounded-full transition-colors ${tone}`} />;
      })}
    </div>
  );
}

/** The card every question sits in. */
export function QuestionPanel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border-light bg-bg-container p-5 shadow-sm sm:p-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      {children}
    </div>
  );
}

/** Green "correct" / red "not quite" strip shown after checking an answer. */
export function Verdict({ score, children }: { score: number; children?: ReactNode }) {
  const full = score >= 1;
  const partial = score > 0 && score < 1;
  const tone = full
    ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200"
    : partial
      ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
      : "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200";
  return (
    <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${tone}`} role="status">
      <p className="flex items-center gap-2 font-semibold">
        {full ? <Check size={16} /> : partial ? <Minus size={16} /> : <X size={16} />}
        {full ? "Correct!" : partial ? "Partly right" : "Not quite"}
      </p>
      {children && <div className="mt-1.5 space-y-1 leading-relaxed">{children}</div>}
    </div>
  );
}

/** For open-ended answers the checker can get wrong: lets the student count their own answer as right. */
export function MarkCorrectButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-current px-3 py-1.5 text-xs font-semibold transition hover:bg-black/5 dark:hover:bg-white/10"
    >
      <Check size={13} /> My answer is correct - count it
    </button>
  );
}

export const PRIMARY_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-text-inverse shadow-sm transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50";
export const SECONDARY_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-border-light bg-bg-container px-4 py-2.5 text-sm font-medium text-text-main transition hover:bg-bg-warm disabled:cursor-not-allowed disabled:opacity-50";
