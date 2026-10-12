"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { ArrowRight, Lightbulb } from "lucide-react";
import { gradeFillBlank, type BlankGrade } from "@/src/library/practice/grading";
import { BLANK_MARKER, type FillBlankItem, type ItemResult } from "@/src/library/practice/types";
import { PRIMARY_BUTTON, ProgressDots, QuestionPanel, Verdict } from "./PracticeShell";

/** One fill-in-the-blank question at a time: type, check, read the explanation, move on. */
export default function FillBlankRunner({ items, onFinish }: { items: FillBlankItem[]; onFinish: (results: ItemResult[]) => void }) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<ItemResult[]>([]);
  const [inputs, setInputs] = useState<string[]>([]);
  const [graded, setGraded] = useState<{ score: number; perBlank: BlankGrade[] } | null>(null);
  const [hintsShown, setHintsShown] = useState<Record<number, boolean>>({});
  const firstInput = useRef<HTMLInputElement>(null);

  const item = items[index];
  const parts = useMemo(() => item.text.split(BLANK_MARKER), [item.text]);
  const checked = graded !== null;

  function check() {
    if (checked) return;
    const result = gradeFillBlank(inputs, item.blanks);
    setGraded(result);
    setResults((all) => [...all, { itemId: item.id, score: result.score, response: item.blanks.map((_, i) => inputs[i] ?? "") }]);
  }

  function next() {
    if (index + 1 >= items.length) {
      onFinish(results);
      return;
    }
    setIndex(index + 1);
    setInputs([]);
    setGraded(null);
    setHintsShown({});
    // Focus the first blank of the next question once it has rendered.
    setTimeout(() => firstInput.current?.focus(), 0);
  }

  const allFilled = item.blanks.every((_, i) => (inputs[i] ?? "").trim());

  return (
    <div className="space-y-4">
      <ProgressDots total={items.length} current={index} scores={results.map((r) => r.score)} />
      <QuestionPanel label={`Question ${index + 1} of ${items.length}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (checked) next();
            else if (allFilled) check();
          }}
        >
          <p className="text-base leading-[2.6rem] text-text-main">
            {parts.map((part, i) => (
              <Fragment key={i}>
                {part}
                {i < item.blanks.length && (
                  <span className="mx-1 inline-block align-middle">
                    <input
                      ref={i === 0 ? firstInput : undefined}
                      value={inputs[i] ?? ""}
                      onChange={(e) => setInputs((all) => Object.assign([...all], { [i]: e.target.value }))}
                      disabled={checked}
                      aria-label={`Blank ${i + 1}`}
                      autoFocus={i === 0}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      size={Math.max(8, Math.min(24, item.blanks[i].answer.length + 3))}
                      className={`rounded-md border-b-2 bg-bg-main px-2 py-0.5 text-center text-base outline-none transition-colors ${
                        graded
                          ? graded.perBlank[i].correct
                            ? "border-emerald-500 text-emerald-700 dark:text-emerald-300"
                            : "border-rose-500 text-rose-700 dark:text-rose-300"
                          : "border-border-hover text-text-main focus:border-primary"
                      }`}
                    />
                    {!checked && item.blanks[i].hint && !hintsShown[i] && (
                      <button
                        type="button"
                        onClick={() => setHintsShown((s) => ({ ...s, [i]: true }))}
                        className="ml-1 align-middle text-text-muted hover:text-primary"
                        aria-label={`Show hint for blank ${i + 1}`}
                        title="Show a hint"
                      >
                        <Lightbulb size={15} />
                      </button>
                    )}
                  </span>
                )}
              </Fragment>
            ))}
          </p>

          {!checked && item.blanks.some((b, i) => hintsShown[i] && b.hint) && (
            <ul className="mt-3 space-y-1 text-sm text-text-muted">
              {item.blanks.map((b, i) =>
                hintsShown[i] && b.hint ? (
                  <li key={i} className="flex items-start gap-2">
                    <Lightbulb size={14} className="mt-0.5 shrink-0 text-amber-500" /> Blank {i + 1}: {b.hint}
                  </li>
                ) : null
              )}
            </ul>
          )}

          {graded && (
            <Verdict score={graded.score}>
              {item.blanks.map((b, i) => (
                <p key={i}>
                  {item.blanks.length > 1 && <span className="font-medium">Blank {i + 1}: </span>}
                  {graded.perBlank[i].correct ? (
                    graded.perBlank[i].typo ? (
                      <>Right - spelled <strong>{b.answer}</strong>.</>
                    ) : (
                      <>
                        <strong>{b.answer}</strong>
                      </>
                    )
                  ) : (
                    <>
                      The answer is <strong>{b.answer}</strong>.
                    </>
                  )}
                </p>
              ))}
              {item.explanation && <p className="pt-1 opacity-90">{item.explanation}</p>}
            </Verdict>
          )}

          <div className="mt-5 flex justify-end">
            {checked ? (
              <button key="next" type="submit" autoFocus className={PRIMARY_BUTTON}>
                {index + 1 >= items.length ? "See results" : "Next question"} <ArrowRight size={15} />
              </button>
            ) : (
              <button key="check" type="submit" disabled={!allFilled} className={PRIMARY_BUTTON}>
                Check
              </button>
            )}
          </div>
        </form>
      </QuestionPanel>
    </div>
  );
}
