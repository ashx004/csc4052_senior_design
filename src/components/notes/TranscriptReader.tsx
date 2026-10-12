"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { BookOpen, Check, Copy, Minus, Pencil, Plus } from "lucide-react";
import { preserveLineBreaks, wordCount } from "@/src/library/notes/transcriptFormat";

const SIZES = ["text-sm", "text-base", "text-lg", "text-xl"] as const;

/**
 * How an OCR transcript is shown: typeset like a document (headings, lists,
 * tables and math rendered) with a switch to a plain editor for fixing
 * mistakes, a copy button and a text-size control. Comfortable on a phone:
 * the reading column fills the screen, tables scroll on their own.
 */
export default function TranscriptReader({
  value,
  onChange,
  label = "Transcript",
}: {
  value: string;
  /** Present when the transcript can be corrected. */
  onChange?: (value: string) => void;
  label?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [size, setSize] = useState(1);
  const [copied, setCopied] = useState(false);
  const display = useMemo(() => preserveLineBreaks(value), [value]);
  const words = wordCount(value);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setEditing(true); // clipboard blocked: let them select the text themselves
    }
  }

  const button = "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-text-main hover:bg-bg-warm disabled:opacity-40";

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-border-light bg-bg-container/95 px-2 py-1.5 backdrop-blur">
        <span className="px-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</span>
        <span className="text-xs tabular-nums text-text-muted">{words} {words === 1 ? "word" : "words"}</span>
        <span className="flex-1" />
        <button type="button" aria-label="Smaller text" disabled={size === 0} onClick={() => setSize((s) => Math.max(0, s - 1))} className={`${button} w-8 justify-center px-0`}>
          <Minus size={14} />
        </button>
        <button type="button" aria-label="Larger text" disabled={size === SIZES.length - 1} onClick={() => setSize((s) => Math.min(SIZES.length - 1, s + 1))} className={`${button} w-8 justify-center px-0`}>
          <Plus size={14} />
        </button>
        <button type="button" onClick={() => void copy()} className={button}>
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
        </button>
        {onChange && (
          <button type="button" onClick={() => setEditing((e) => !e)} aria-pressed={editing} className={`${button} ${editing ? "bg-bg-warm" : ""}`}>
            {editing ? <BookOpen size={14} /> : <Pencil size={14} />} {editing ? "Done" : "Fix mistakes"}
          </button>
        )}
      </div>
      {editing && onChange ? (
        <div className="px-3 py-4 sm:px-8">
          <p className="mb-2 text-xs text-text-muted">Edits save automatically. Markdown works: # headings, - lists, $math$.</p>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck
            autoFocus
            aria-label="Edit transcript"
            className={`min-h-[60vh] w-full resize-y rounded-lg border border-border-light bg-bg-main p-3 leading-relaxed text-text-main outline-none focus:border-primary ${SIZES[size]}`}
          />
        </div>
      ) : value.trim() ? (
        <article
          className={`prose max-w-none px-4 py-5 leading-relaxed sm:px-8 sm:py-7 ${SIZES[size]} ${size >= 2 ? "prose-lg" : "prose-base"} prose-headings:font-semibold prose-headings:text-text-main prose-p:my-2 prose-p:text-text-main prose-li:text-text-main prose-li:my-0.5 prose-strong:text-text-main prose-a:text-primary prose-code:text-text-main prose-blockquote:text-text-muted prose-th:text-text-main prose-td:text-text-main break-words`}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              table: ({ children }) => (
                <div className="my-3 overflow-x-auto rounded-lg border border-border-light">
                  <table className="my-0 min-w-full">{children}</table>
                </div>
              ),
            }}
          >
            {display}
          </ReactMarkdown>
        </article>
      ) : (
        <p className="px-6 py-10 text-center text-sm text-text-muted">No text was found in this document.</p>
      )}
    </div>
  );
}
