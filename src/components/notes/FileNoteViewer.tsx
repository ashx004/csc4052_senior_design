"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileWarning, Loader2, Save } from "lucide-react";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import { saveTypedNote } from "@/src/library/notes/notesStore";
import type { Note } from "@/src/library/notes/types";

const CODE_EXTENSIONS = new Set([
  "txt", "md", "py", "java", "js", "jsx", "ts", "tsx", "c", "h", "cpp", "hpp", "cs", "go", "rs", "rb", "php",
  "swift", "kt", "sql", "sh", "html", "css", "json", "xml", "yaml", "yml", "ipynb", "r", "m", "asm",
]);
const WORD_EXTENSIONS = new Set(["doc", "docx", "odt", "rtf"]);
const SHEET_EXTENSIONS = new Set(["xls", "xlsx", "csv", "tsv", "ods"]);

type ViewState = "loading" | "ready" | "error";

[["python", python], ["javascript", javascript], ["typescript", typescript], ["java", java], ["c", c], ["cpp", cpp], ["markup", markup], ["css", css], ["bash", bash]].forEach(([name, language]) => SyntaxHighlighter.registerLanguage(name as string, language as never));

/**
 * The file view used after selecting an uploaded resource from either Notes
 * library. Office files stay read-only; source files retain a plain text area
 * for the student's own notes, without rich-text controls or markup.
 */
export default function FileNoteViewer({
  uid,
  note,
  onSaveStateChange,
}: {
  uid: string;
  note: Note;
  onSaveStateChange: (state: "saved" | "saving" | "error") => void;
}) {
  const ext = (note.fileType ?? "").toLowerCase();
  const [state, setState] = useState<ViewState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sheetHtml, setSheetHtml] = useState("");
  const [sourceDraft, setSourceDraft] = useState("");
  const [savingSource, setSavingSource] = useState(false);
  const docRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setError(null);
    setText("");
    setSheetHtml("");
    (async () => {
      try {
        if (!note.url) throw new Error("This file no longer has a download URL.");
        if (WORD_EXTENSIONS.has(ext)) {
          // docx-preview is the existing class-resource renderer. Older Word
          // formats remain downloadable because browsers cannot render them.
          if (ext !== "docx") throw new Error(`.${ext.toUpperCase()} files can be downloaded to view them.`);
          const [response, preview] = await Promise.all([fetch(note.url), import("docx-preview")]);
          if (!response.ok) throw new Error("The Word document could not be loaded.");
          const buffer = await response.arrayBuffer();
          if (cancelled || !docRef.current) return;
          docRef.current.replaceChildren();
          await preview.renderAsync(buffer, docRef.current, undefined, { inWrapper: false, ignoreWidth: false, ignoreHeight: false });
        } else if (SHEET_EXTENSIONS.has(ext)) {
          const response = await fetch(note.url);
          if (!response.ok) throw new Error("The spreadsheet could not be loaded.");
          if (ext === "csv" || ext === "tsv") {
            const raw = await response.text();
            const rows = raw.split(/\r?\n/).slice(0, 200).map((line) => line.split(ext === "tsv" ? "\t" : ","));
            setSheetHtml(tableHtml(rows));
          } else {
            const XLSX = await import("xlsx");
            const workbook = XLSX.read(await response.arrayBuffer(), { type: "array" });
            const first = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json<string[]>(first, { header: 1, blankrows: false }).slice(0, 200);
            setSheetHtml(tableHtml(rows));
          }
        } else if (CODE_EXTENSIONS.has(ext)) {
          const response = await fetch(note.url);
          if (!response.ok) throw new Error("The file could not be loaded.");
          const source = decodeSource(await response.arrayBuffer());
          setText(source);
          setSourceDraft(source);
        }
        if (!cancelled) setState("ready");
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "This file couldn't be opened.");
          setState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [note.id, note.url, ext]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (sourceTimer.current) clearTimeout(sourceTimer.current);
  }, []);

  function savePlainNotes(value: string) {
    if (timer.current) clearTimeout(timer.current);
    onSaveStateChange("saving");
    timer.current = setTimeout(() => {
      saveTypedNote(uid, note.id, { plainText: value })
        .then(() => onSaveStateChange("saved"))
        .catch(() => onSaveStateChange("error"));
    }, 700);
  }

  async function saveSource(value = sourceDraft) {
    const key = storageKey(note.url);
    if (!key) {
      onSaveStateChange("error");
      return;
    }
    setSavingSource(true);
    onSaveStateChange("saving");
    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "text/plain; charset=utf-8", "x-storage-path": key },
        body: value,
      });
      if (!response.ok) throw new Error("Couldn't save the source file.");
      setText(value);
      onSaveStateChange("saved");
    } catch {
      onSaveStateChange("error");
    } finally {
      setSavingSource(false);
    }
  }

  function updateSource(value: string) {
    setSourceDraft(value);
    if (sourceTimer.current) clearTimeout(sourceTimer.current);
    sourceTimer.current = setTimeout(() => void saveSource(value), 750);
  }

  if (state === "loading") {
    return <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted"><Loader2 size={17} className="animate-spin" /> Opening file...</div>;
  }

  if (state === "error") {
    return <DownloadFallback url={note.url} message={error ?? "This file couldn't be opened."} />;
  }

  if (WORD_EXTENSIONS.has(ext) || SHEET_EXTENSIONS.has(ext)) {
    return (
      <div className="flex flex-1 flex-col overflow-auto">
        <OfficePaper>{WORD_EXTENSIONS.has(ext) ? <div ref={docRef} className="docx-render" /> : <div className="sheet-render" dangerouslySetInnerHTML={{ __html: sheetHtml }} />}</OfficePaper>
        <section className="mx-auto mb-6 w-full max-w-6xl px-4">
          <p className="rounded-lg bg-bg-warm px-3 py-2 text-xs text-text-muted">You can add an annotation below, but Word and Excel downloads remain the original file and will not include it.</p>
          <textarea defaultValue={note.plainText ?? ""} onChange={(event) => savePlainNotes(event.target.value)} placeholder="Add an annotation..." className="mt-2 min-h-28 w-full resize-y rounded-lg border border-border-light bg-bg-container p-3 text-sm text-text-main outline-none focus:border-primary" />
        </section>
      </div>
    );
  }
  if (CODE_EXTENSIONS.has(ext)) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 overflow-auto px-4 py-4">
        <section className="overflow-auto rounded-lg border border-border-light bg-[#faf9f7] shadow-sm">
          <div className="flex items-center justify-between border-b border-border-light px-3 py-2">
            <span className="text-xs font-medium text-text-muted">.{ext}</span>
            <button type="button" disabled={savingSource || sourceDraft === text} onClick={() => void saveSource()} className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs font-medium text-text-inverse disabled:opacity-50"><Save size={13} /> {savingSource ? "Saving..." : sourceDraft === text ? "Saved" : "Save now"}</button>
          </div>
          <div className="relative min-h-[32rem] overflow-hidden">
            <SyntaxHighlighter language={languageFor(ext)} style={oneLight} customStyle={{ margin: 0, minHeight: "32rem", padding: "1rem", fontSize: "13px", lineHeight: "24px", background: "#faf9f7", whiteSpace: "pre" }} codeTagProps={{ style: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } }}>
              {sourceDraft || " "}
            </SyntaxHighlighter>
            <textarea value={sourceDraft} onChange={(event) => updateSource(event.target.value)} spellCheck={false} className="absolute inset-0 h-full w-full resize-y bg-transparent p-4 font-mono text-[13px] leading-6 text-transparent caret-[#1f2328] outline-none selection:bg-primary/30" aria-label="Edit source file" />
          </div>
        </section>
      </div>
    );
  }
  return <DownloadFallback url={note.url} message="This file opens in its usual application." />;
}

function storageKey(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname === "/api/download" ? parsed.searchParams.get("key") : null;
  } catch { return null; }
}

function decodeSource(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  // CAFEBABE marks a compiled Java .class file, not Java source code. Treat
  // it as a download rather than rendering replacement-character glyphs.
  if (view[0] === 0xca && view[1] === 0xfe && view[2] === 0xba && view[3] === 0xbe) throw new Error("This is compiled Java bytecode. Download it to open it with a Java tool.");
  if (view[0] === 0xff && view[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.slice(2));
  if (view[0] === 0xfe && view[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.slice(2));
  return new TextDecoder("utf-8").decode(bytes);
}

function languageFor(ext: string): string {
  return ({ py: "python", js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", java: "java", c: "c", h: "c", cpp: "cpp", hpp: "cpp", html: "markup", xml: "markup", css: "css", sh: "bash" } as Record<string, string>)[ext] ?? "javascript";
}

function OfficePaper({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl overflow-auto px-4 py-5"><div className="office-file-view rounded-lg bg-white p-6 text-[#1f1712] shadow-sm">{children}</div></div>;
}

function DownloadFallback({ url, message }: { url?: string; message: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-border-light bg-bg-container p-6 text-center">
      <FileWarning className="mx-auto text-text-muted" size={28} />
      <p className="mt-3 text-sm text-text-main">{message}</p>
      {url && <a href={url} download className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary-hover"><Download size={15} /> Download file</a>}
    </div>
  );
}

function tableHtml(rows: unknown[][]): string {
  const esc = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
  return `<table><tbody>${rows.map((row) => `<tr>${row.slice(0, 80).map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
