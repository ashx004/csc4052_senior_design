"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { gradeNumeric } from "@/src/library/practice/grading";
import { MAX_WRITTEN_ANSWER_CHARS, type ItemResult, type WordProblemItem } from "@/src/library/practice/types";
import { PRIMARY_BUTTON, ProgressDots, QuestionPanel, Verdict } from "./PracticeShell";

interface Outcome {
  score: number;
  /** Feedback for a written answer, or a note on how a number was read. */
  note?: string;
}

/** Word problems, one at a time: numbers are marked on the spot, written answers by the AI. */
export default function WordProblemRunner({
  courseId,
  setId,
  items,
  onFinish,
}: {
  /** The class the set belongs to; null for a custom (no-class) set. */
  courseId: string | null;
  setId: string;
  items: WordProblemItem[];
  onFinish: (results: ItemResult[]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<ItemResult[]>([]);
  const [answer, setAnswer] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const item = items[index];
  const isNumber = item.answerType === "number";

  function record(result: Outcome) {
    setOutcome(result);
    setResults((all) => [...all, { itemId: item.id, score: result.score, response: answer.trim() }]);
  }

  async function check() {
    if (outcome || checking || !answer.trim()) return;
    setError(null);
    if (isNumber) {
      const graded = gradeNumeric(answer, item);
      record({
        score: graded.correct ? 1 : 0,
        note: !graded.correct && graded.read !== null ? `We read your answer as ${graded.read}.` : !graded.correct && graded.read === null ? "We couldn't find a number in your answer." : undefined,
      });
      return;
    }
    setChecking(true);
    try {
      const response = await fetch("/api/grade-practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(courseId ? { courseId } : { custom: true }), setId, itemId: item.id, answer: answer.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Couldn't check that answer.");
      record({ score: Number(data.score) || 0, note: typeof data.feedback === "string" ? data.feedback : undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check that answer. Please try again.");
    } finally {
      setChecking(false);
    }
  }

  function next() {
    if (index + 1 >= items.length) {
      onFinish(results);
      return;
    }
    setIndex(index + 1);
    setAnswer("");
    setOutcome(null);
    setError(null);
  }

  return (
    <div className="space-y-4">
      <ProgressDots total={items.length} current={index} scores={results.map((r) => r.score)} />
      <QuestionPanel label={`Problem ${index + 1} of ${items.length}`}>
        <p className="whitespace-pre-wrap text-base leading-relaxed text-text-main">{item.problem}</p>

        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (outcome) next();
            else void check();
          }}
        >
          {isNumber ? (
            <label className="flex items-center gap-3">
              <span className="text-sm font-medium text-text-muted">Your answer</span>
              <input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={!!outcome}
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                placeholder="e.g. 42"
                className="w-40 rounded-lg border border-border-light bg-bg-main px-3 py-2 text-base text-text-main outline-none focus:border-primary disabled:opacity-70"
              />
              {item.unit && <span className="text-sm text-text-muted">{item.unit}</span>}
            </label>
          ) : (
            <div>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value.slice(0, MAX_WRITTEN_ANSWER_CHARS))}
                disabled={!!outcome || checking}
                rows={5}
                autoFocus
                placeholder="Write your answer in a few sentences..."
                aria-label="Your answer"
                className="w-full resize-y rounded-lg border border-border-light bg-bg-main px-3 py-2.5 text-sm leading-relaxed text-text-main outline-none focus:border-primary disabled:opacity-70"
              />
              <p className="mt-1 text-right text-xs text-text-muted">
                {answer.length}/{MAX_WRITTEN_ANSWER_CHARS}
              </p>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-alert-error">{error}</p>}

          {outcome && (
            <Verdict score={outcome.score}>
              {outcome.note && <p>{outcome.note}</p>}
              {isNumber ? (
                <p>
                  The answer is <strong>{item.expectedAnswer}</strong>
                  {item.unit ? ` ${item.unit}` : ""}.
                </p>
              ) : (
                <div>
                  <p className="font-medium">A strong answer:</p>
                  <p className="opacity-90">{item.expectedAnswer}</p>
                </div>
              )}
              {item.solution && (
                <details className="pt-1">
                  <summary className="cursor-pointer font-medium">{isNumber ? "How to solve it" : "Why"}</summary>
                  <p className="mt-1 whitespace-pre-wrap opacity-90">{item.solution}</p>
                </details>
              )}
            </Verdict>
          )}

          <div className="mt-5 flex justify-end">
            {outcome ? (
              <button key="next" type="submit" autoFocus className={PRIMARY_BUTTON}>
                {index + 1 >= items.length ? "See results" : "Next problem"} <ArrowRight size={15} />
              </button>
            ) : (
              <button key="check" type="submit" disabled={!answer.trim() || checking} className={PRIMARY_BUTTON}>
                {checking ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Checking...
                  </>
                ) : (
                  "Check answer"
                )}
              </button>
            )}
          </div>
        </form>
      </QuestionPanel>
    </div>
  );
}
