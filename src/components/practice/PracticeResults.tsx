"use client";

import { Check, Clock, Minus, RotateCcw, Sparkles, X } from "lucide-react";
import { totalScore } from "@/src/library/practice/grading";
import { formatClock } from "@/src/library/practice/dragDrop";
import { KIND_LABELS, type ItemResult, type PracticeItem, type PracticeKind } from "@/src/library/practice/types";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "./PracticeShell";

function summaryOf(item: PracticeItem): string {
  if (item.kind === "fill_blank") return item.text.replace(/_{4}/g, "____");
  if (item.kind === "word_problem") return item.problem;
  return item.instructions;
}

function responseOf(item: PracticeItem, result: ItemResult): string | null {
  const r = result.response;
  if (item.kind === "fill_blank" && Array.isArray(r)) return r.map((x) => String(x || "(blank)")).join(", ");
  if (item.kind === "word_problem" && typeof r === "string") return r || "(no answer)";
  return null;
}

/** The score, time and a line per question for a finished run (or a past one). */
export default function PracticeResults({
  kind,
  items,
  results,
  durationMs,
  points,
  onRetry,
  onNewQuestions,
  newQuestionsBusy,
}: {
  kind: PracticeKind;
  items: PracticeItem[];
  results: ItemResult[];
  durationMs: number;
  /** Drag-and-drop runs only: points including speed bonuses. */
  points?: number;
  onRetry?: () => void;
  onNewQuestions?: () => void;
  newQuestionsBusy?: boolean;
}) {
  const { score, total, percent } = totalScore(results);
  const message = percent >= 90 ? "Outstanding!" : percent >= 70 ? "Nice work!" : percent >= 40 ? "Getting there." : "Keep practicing - you'll get it.";
  const byId = new Map(results.map((r) => [r.itemId, r]));

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border-light bg-bg-container p-6 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{KIND_LABELS[kind].title}</p>
        <p className="mt-2 text-5xl font-bold tabular-nums text-text-main">{percent}%</p>
        <p className="mt-1 text-sm text-text-muted">
          {Number.isInteger(score) ? score : score.toFixed(1)} of {total} correct &middot; <Clock size={12} className="mb-0.5 inline" /> {formatClock(durationMs / 1000)}
          {points !== undefined && <> &middot; {points} pts</>}
        </p>
        <p className="mt-3 text-sm font-medium text-text-main">{message}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {onRetry && (
            <button type="button" onClick={onRetry} className={SECONDARY_BUTTON}>
              <RotateCcw size={14} /> Try this set again
            </button>
          )}
          {onNewQuestions && (
            <button type="button" onClick={onNewQuestions} disabled={newQuestionsBusy} className={PRIMARY_BUTTON}>
              <Sparkles size={14} /> {newQuestionsBusy ? "Making new questions..." : "New questions"}
            </button>
          )}
        </div>
      </div>

      <ul className="divide-y divide-border-light overflow-hidden rounded-2xl border border-border-light bg-bg-container">
        {items.map((item, i) => {
          const result = byId.get(item.id);
          if (!result) return null;
          const shown = responseOf(item, result);
          return (
            <li key={item.id} className="flex items-start gap-3 px-4 py-3">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white ${
                  result.score >= 1 ? "bg-emerald-500" : result.score > 0 ? "bg-amber-400" : "bg-rose-400"
                }`}
              >
                {result.score >= 1 ? <Check size={12} /> : result.score > 0 ? <Minus size={12} /> : <X size={12} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text-main">
                  <span className="mr-1.5 text-xs font-semibold text-text-muted">{i + 1}.</span>
                  {summaryOf(item)}
                </p>
                {shown && <p className="mt-0.5 text-xs text-text-muted">Your answer: {shown}</p>}
                {item.kind === "fill_blank" && <p className="mt-0.5 text-xs text-text-muted">Answer: {item.blanks.map((b) => b.answer).join(", ")}</p>}
                {item.kind === "word_problem" && item.answerType === "number" && (
                  <p className="mt-0.5 text-xs text-text-muted">
                    Answer: {item.expectedAnswer} {item.unit ?? ""}
                  </p>
                )}
                {result.seconds !== undefined && <p className="mt-0.5 text-xs text-text-muted">{formatClock(result.seconds)}</p>}
              </div>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-text-muted">{Math.round(result.score * 100)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
