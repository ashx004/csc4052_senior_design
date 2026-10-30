"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useAuth } from "@/src/context/AuthContext";
import {
  defaultDecision,
  ImportStillRunningError,
  previewDataImport,
  runDataImport,
  type ImportClassPreview,
  type ImportDecision,
  type ImportPreview,
  type ImportSummary,
} from "@/src/library/dataImportRequest";

type Step =
  | { kind: "idle" }
  | { kind: "checking"; file: File }
  | { kind: "preview"; file: File; preview: ImportPreview; decisions: Record<string, ImportDecision> }
  | { kind: "importing"; file: File; preview: ImportPreview; decisions: Record<string, ImportDecision> }
  | { kind: "done"; summary: ImportSummary }
  | { kind: "still-running" };

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function contents(counts: { documents: number; quizSets: number; flashcardSets: number; practiceSets: number }): string {
  const parts = [
    plural(counts.documents, "document"),
    counts.quizSets ? plural(counts.quizSets, "quiz", "quizzes") : "",
    counts.flashcardSets ? plural(counts.flashcardSets, "flashcard set") : "",
    counts.practiceSets ? plural(counts.practiceSets, "practice set") : "",
  ];
  return parts.filter(Boolean).join(" · ");
}

const ACTION_LABEL = {
  imported: "Imported",
  merged: "Merged",
  copied: "Imported as a copy",
  skipped: "Skipped",
  failed: "Failed",
} as const;

/** "Import my data": restores classes from a "Download my data" ZIP. Shows a
 *  preview first, so the student decides what happens to classes they
 *  already have, then a summary of what was restored. */
export default function DataImportCard() {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep({ kind: "idle" });
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    setError("");
    setStep({ kind: "checking", file });
    try {
      const preview = await previewDataImport(await user.getIdToken(), file);
      const decisions = Object.fromEntries(preview.classes.map((cls) => [cls.sourceId, defaultDecision(cls)]));
      setStep({ kind: "preview", file, preview, decisions });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to read this file.");
      setStep({ kind: "idle" });
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function choose(cls: ImportClassPreview, decision: ImportDecision) {
    setStep((current) =>
      current.kind === "preview" ? { ...current, decisions: { ...current.decisions, [cls.sourceId]: decision } } : current,
    );
  }

  async function handleImport() {
    if (step.kind !== "preview" || !user) return;
    setError("");
    setStep({ ...step, kind: "importing" });
    try {
      const summary = await runDataImport(await user.getIdToken(), step.file, step.decisions);
      setStep({ kind: "done", summary });
    } catch (err) {
      if (err instanceof ImportStillRunningError) {
        setStep({ kind: "still-running" });
        return;
      }
      setError(err instanceof Error ? err.message : "Unable to import your data. Please try again.");
      setStep({ ...step, kind: "preview" });
    }
  }

  const busy = step.kind === "checking" || step.kind === "importing";
  const selected = step.kind === "preview" || step.kind === "importing"
    ? step.preview.classes.filter((cls) => step.decisions[cls.sourceId] !== "skip").length
    : 0;

  return (
    <div className="rounded-md border border-border-light bg-bg-container p-3">
      <h3 className="text-sm font-medium text-text-main">Import my data</h3>
      <p className="mt-1 text-xs text-text-muted">
        Restore your classes from a Catalyst export: their documents, quizzes, flashcards and practice sets, with document
        search ready to use. Settings, AI credit and sign-in details are never imported.
      </p>

      {(step.kind === "idle" || step.kind === "checking") && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-text-muted">Choose the ZIP file from &ldquo;Download my data&rdquo;. Nothing is changed until you confirm.</p>
          <label
            className={`shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-text-inverse transition hover:bg-primary-hover ${
              !user || busy ? "pointer-events-none opacity-50" : "cursor-pointer"
            }`}
          >
            {step.kind === "checking" ? "Checking file..." : "Choose export file"}
            <input
              ref={inputRef}
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              onChange={handleFile}
              disabled={!user || busy}
            />
          </label>
        </div>
      )}

      {(step.kind === "preview" || step.kind === "importing") && (
        <div className="mt-3 flex flex-col gap-3">
          {step.preview.fromAnotherAccount && (
            <p className="rounded-md bg-bg-warm px-3 py-2 text-xs text-text-main">
              This export came from a different Catalyst account. Its classes will be added to the account you&rsquo;re
              signed in to now.
            </p>
          )}
          {step.preview.classes.length === 0 ? (
            <p className="text-xs text-text-muted">This export doesn&rsquo;t contain any classes.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-light rounded-md border border-border-light" aria-label="Classes in this export">
              {step.preview.classes.map((cls) => (
                <li key={cls.sourceId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-text-main">
                      {cls.className}
                      {cls.classCode && <span className="text-text-muted"> · {cls.classCode}</span>}
                      {cls.term && <span className="text-text-muted"> · {cls.term}</span>}
                    </p>
                    <p className="text-xs text-text-muted">{contents(cls.counts)}</p>
                    {cls.conflict && (
                      <p className="text-xs font-medium text-text-main">You already have this class as &ldquo;{cls.conflict.className}&rdquo;.</p>
                    )}
                  </div>
                  <select
                    aria-label={`What to do with ${cls.className}`}
                    value={step.decisions[cls.sourceId]}
                    onChange={(event) => choose(cls, event.target.value as ImportDecision)}
                    disabled={step.kind === "importing"}
                    className="rounded-md border border-border-light bg-bg-container px-2 py-1 text-xs text-text-main"
                  >
                    {cls.conflict ? (
                      <>
                        <option value="skip">Skip it</option>
                        <option value="merge">Add to my existing class</option>
                        <option value="copy">Import as a copy</option>
                      </>
                    ) : (
                      <>
                        <option value="import">Import</option>
                        <option value="skip">Skip</option>
                      </>
                    )}
                  </select>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={reset}
              disabled={step.kind === "importing"}
              className="rounded-md border border-border-light px-3 py-1.5 text-xs font-medium text-text-main transition hover:bg-bg-warm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={step.kind === "importing" || selected === 0}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-text-inverse transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {step.kind === "importing" ? "Importing... keep this page open" : `Import ${plural(selected, "class", "classes")}`}
            </button>
          </div>
        </div>
      )}

      {step.kind === "done" && (
        <div className="mt-3 flex flex-col gap-2" role="status">
          <p className="text-xs font-medium text-text-main">Import finished</p>
          <ul className="flex flex-col gap-1">
            {step.summary.classes.map((result) => (
              <li key={result.sourceId} className="text-xs">
                <span className={result.action === "failed" ? "text-alert-error" : "text-text-main"}>
                  {result.className}: {ACTION_LABEL[result.action]}
                </span>
                {result.action !== "skipped" && result.action !== "failed" && (
                  <span className="text-text-muted">
                    {" "}— {contents(result)}
                    {result.searchRestored > 0 && `, search ready for ${plural(result.searchRestored, "document")}`}
                    {result.queuedForIndexing > 0 && `, ${result.queuedForIndexing} still being indexed`}
                  </span>
                )}
                {result.error && <span className="block text-alert-error">{result.error}</span>}
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-border-light px-3 py-1.5 text-xs font-medium text-text-main transition hover:bg-bg-warm"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {step.kind === "still-running" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3" role="status">
          <p className="text-xs text-text-main">
            Your import is large and is still finishing. Your classes will appear in a few minutes. Don&rsquo;t import the
            same file again in the meantime.
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-border-light px-3 py-1.5 text-xs font-medium text-text-main transition hover:bg-bg-warm"
          >
            OK
          </button>
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-xs text-alert-error">{error}</p>}
    </div>
  );
}
