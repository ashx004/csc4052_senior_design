"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Loader2, PenLine, Puzzle, Sparkles, Variable } from "lucide-react";
import {
  DIFFICULTY_LABELS,
  KIND_LABELS,
  PRACTICE_KINDS,
  type DragDropMode,
  type PracticeDifficulty,
  type PracticeKind,
} from "@/src/library/practice/types";
import type { PracticeSource } from "@/src/hooks/usePracticeGeneration";
import { PRIMARY_BUTTON } from "./PracticeShell";

export interface SetupResource {
  id: string;
  name: string;
  source: PracticeSource;
}

const KIND_ICONS: Record<PracticeKind, typeof PenLine> = { fill_blank: PenLine, word_problem: Variable, drag_drop: Puzzle };
const MODE_LABELS: Record<DragDropMode, string> = { match: "Match terms", categorize: "Sort into groups", sequence: "Put in order" };
const MODES: DragDropMode[] = ["match", "categorize", "sequence"];

export interface SetupChoice {
  source: PracticeSource;
  kind: PracticeKind;
  count: number;
  difficulty: PracticeDifficulty;
  modes?: DragDropMode[];
}

/** Pick a type of practice, a document and how much, then generate it. */
export default function PracticeSetup({
  resources,
  initialKind,
  loading,
  error,
  onGenerate,
}: {
  resources: SetupResource[];
  initialKind?: PracticeKind;
  loading: boolean;
  error: string | null;
  onGenerate: (choice: SetupChoice) => void;
}) {
  const [kind, setKind] = useState<PracticeKind>(initialKind ?? "fill_blank");
  const [resourceId, setResourceId] = useState<string>(resources[0]?.id ?? "");
  const [count, setCount] = useState(6);
  const [difficulty, setDifficulty] = useState<PracticeDifficulty>("exam");
  const [modes, setModes] = useState<DragDropMode[]>(MODES);

  const chosen = resources.find((r) => r.id === resourceId) ?? resources[0];
  const isDrag = kind === "drag_drop";
  const max = isDrag ? 8 : 12;
  const min = isDrag ? 2 : 3;
  const shown = Math.min(max, Math.max(min, count));
  const noun = isDrag ? "rounds" : kind === "word_problem" ? "problems" : "questions";

  return (
    <section className="rounded-2xl border border-border-light bg-bg-container p-5 shadow-sm sm:p-6" data-tutorial="practice-setup">
      <h2 className="flex items-center gap-2 text-base font-bold text-text-main">
        <Sparkles size={16} className="text-primary" /> Make new practice
      </h2>
      <p className="mt-1 text-xs text-text-muted">
        Want to use your own prompt and files instead of this class&apos;s documents?{" "}
        <Link href="/custom/new?type=practice" className="font-medium text-primary hover:underline">
          Make a custom practice exam
        </Link>
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Type of practice">
        {PRACTICE_KINDS.map((k) => {
          const Icon = KIND_ICONS[k];
          const active = k === kind;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setKind(k)}
              className={`rounded-xl border p-4 text-left transition ${active ? "border-primary bg-bg-warm ring-1 ring-primary" : "border-border-light hover:bg-bg-warm"}`}
            >
              <Icon size={18} className={active ? "text-primary" : "text-text-muted"} />
              <p className="mt-2 text-sm font-semibold text-text-main">{KIND_LABELS[k].title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{KIND_LABELS[k].description}</p>
            </button>
          );
        })}
      </div>

      {resources.length === 0 ? (
        <p className="mt-5 rounded-lg bg-bg-main p-4 text-sm text-text-muted">Upload a document to this class first, then come back to build practice from it.</p>
      ) : (
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
              <FileText size={12} /> Practice from
            </span>
            <select
              value={chosen?.id ?? ""}
              onChange={(e) => setResourceId(e.target.value)}
              className="w-full rounded-lg border border-border-light bg-bg-main px-3 py-2.5 text-sm text-text-main outline-none focus:border-primary"
            >
              {resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Difficulty</span>
            <div className="flex rounded-lg border border-border-light p-0.5" role="radiogroup" aria-label="Difficulty">
              {(Object.keys(DIFFICULTY_LABELS) as PracticeDifficulty[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={difficulty === d}
                  onClick={() => setDifficulty(d)}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${difficulty === d ? "bg-primary text-text-inverse" : "text-text-muted hover:text-text-main"}`}
                >
                  {DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-muted">
              <span>How many {noun}</span>
              <span className="text-sm normal-case tabular-nums text-text-main">{shown}</span>
            </span>
            <input type="range" min={min} max={max} value={shown} onChange={(e) => setCount(Number(e.target.value))} className="w-full accent-[var(--color-primary,#1a1a2e)]" />
          </label>

          {isDrag && (
            <fieldset>
              <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Round types</legend>
              <div className="flex flex-wrap gap-2">
                {MODES.map((m) => {
                  const on = modes.includes(m);
                  return (
                    <label
                      key={m}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${on ? "border-primary bg-bg-warm text-text-main" : "border-border-light text-text-muted"}`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setModes((current) => (on ? current.filter((x) => x !== m) : [...current, m]))}
                        className="sr-only"
                      />
                      {MODE_LABELS[m]}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
        </div>
      )}

      {error && <p className="mt-4 rounded-lg border border-alert-error bg-alert-error-bg p-3 text-sm text-alert-error">{error}</p>}

      <div className="mt-5 flex items-center justify-end gap-3">
        {loading && <p className="text-xs text-text-muted">This takes up to a minute.</p>}
        <button
          type="button"
          disabled={loading || !chosen || (isDrag && modes.length === 0)}
          onClick={() => chosen && onGenerate({ source: chosen.source, kind, count: shown, difficulty, modes: isDrag ? modes : undefined })}
          className={PRIMARY_BUTTON}
        >
          {loading ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Making your practice...
            </>
          ) : (
            "Generate"
          )}
        </button>
      </div>
    </section>
  );
}
