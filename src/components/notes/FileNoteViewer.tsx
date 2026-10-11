"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Download, File as FileIcon, Loader2, Save } from "lucide-react";
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
import { preserveLineBreaks } from "@/src/library/notes/transcriptFormat";
import { PAGE_WIDTH, type Note } from "@/src/library/notes/types";
import AnnotatedSheet from "./AnnotatedSheet";
import FileNotesEditor from "./FileNotesEditor";

const CODE_EXTENSIONS = new Set([
  "txt", "md", "py", "java", "js", "jsx", "ts", "tsx", "c", "h", "cpp", "hpp", "cs", "go", "rs", "rb", "php",
  "swift", "kt", "sql", "sh", "html", "css", "json", "xml", "yaml", "yml", "ipynb", "r", "m", "asm",
]);
const WORD_EXTENSIONS = new Set(["doc", "docx", "odt", "rtf"]);
const SHEET_EXTENSIONS = new Set(["xls", "xlsx", "csv", "tsv", "ods"]);
const MARKDOWN_EXTENSIONS = new Set(["txt", "md"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "aac", "ogg", "oga", "flac"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "m4v", "webm", "mov", "ogv"]);

type ViewState = "loading" | "ready" | "error";

[["python", python], ["javascript", javascript], ["typescript", typescript], ["java", java], ["c", c], ["cpp", cpp], ["markup", markup], ["css", css], ["bash", bash]].forEach(([name, language]) => SyntaxHighlighter.registerLanguage(name as string, language as never));

/**
 * The file view used after selecting an uploaded resource from either Notes
 * library: Word files, spreadsheets, source files, audio, video and anything
 * else on a paper-width sheet with the same drawing, highlighting, text and
 * sticker tools as every other note, plus a markdown notes box underneath.
 * Types the browser can't render show a file card on the sheet instead, so
 * every file can still be annotated and written about. Office files stay
 * read-only; source files can be edited.
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
  const [showSource, setShowSource] = useState(false);
  const docRef = useRef<HTMLDivElement | null>(null);
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
    if (sourceTimer.current) clearTimeout(sourceTimer.current);
  }, []);

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

  // Word docs are marked up directly now; a note that has ever had written text (even if since cleared) keeps its editor.
  const [hadWrittenNotes] = useState(() => !!note.plainText?.trim() || note.content != null);
  const isWord = WORD_EXTENSIONS.has(ext);
  const isSheet = SHEET_EXTENSIONS.has(ext);
  const isCode = CODE_EXTENSIONS.has(ext);
  const isAudio = AUDIO_EXTENSIONS.has(ext);
  const isVideo = VIDEO_EXTENSIONS.has(ext);
  const canMarkdown = MARKDOWN_EXTENSIONS.has(ext);
  const markdownView = canMarkdown && !showSource;
  const isOther = !isWord && !isSheet && !isCode && !isAudio && !isVideo;
  const showCard = isOther || state === "error";

  return (
    <AnnotatedSheet
      uid={uid}
      noteId={note.id}
      note={note}
      onSaveStateChange={onSaveStateChange}
      below={
        <>
          <p className="mx-auto mt-4 rounded-lg bg-bg-warm px-3 py-2 text-xs text-text-muted" style={{ maxWidth: PAGE_WIDTH }}>
            {isWord ? "Mark up the document directly: highlight, draw, and add text or stickers anywhere on it. Your marks are saved with your note; the original file is never changed." : "Draw, highlight and add text or stickers right on the file. They are saved with your note; the original file is never changed."}
          </p>
          {(!isWord || hadWrittenNotes) && <FileNotesEditor uid={uid} note={note} onSaveStateChange={onSaveStateChange} />}
        </>
      }
    >
      {showCard && <FileCard ext={ext} title={note.title} url={note.url} message={state === "error" ? error ?? "This file couldn't be opened." : "This file type opens in its usual application. Download it to view it, and mark it up here."} />}
      {state === "loading" && !showCard && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#6b5d4f]">
          <Loader2 size={17} className="animate-spin" /> Opening file...
        </div>
      )}
      {isAudio && state !== "error" && <MediaPlayer kind="audio" url={note.url} />}
      {isVideo && state !== "error" && <MediaPlayer kind="video" url={note.url} />}
      {isWord && state !== "error" && <FitWidth><div ref={docRef} className="docx-render" /></FitWidth>}
      {isSheet && state === "ready" && <FitWidth><div className="sheet-render" dangerouslySetInnerHTML={{ __html: sheetHtml }} /></FitWidth>}
      {isCode && state === "ready" && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-[#6b5d4f]">.{ext}</span>
            <div className="flex items-center gap-2">
              {canMarkdown && (
                <button type="button" aria-pressed={markdownView} onClick={() => setShowSource((value) => !value)} className="rounded border border-[#d9cfc3] bg-white px-2 py-1 text-xs font-medium text-[#1f1712] hover:bg-[#f4efe8]">
                  {markdownView ? "Edit source" : "View as markdown"}
                </button>
              )}
              {!markdownView && <button type="button" disabled={savingSource || sourceDraft === text} onClick={() => void saveSource()} className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs font-medium text-text-inverse disabled:opacity-50"><Save size={13} /> {savingSource ? "Saving..." : sourceDraft === text ? "Saved" : "Save now"}</button>}
            </div>
          </div>
          {markdownView ? (
            <article className="prose prose-base max-w-none break-words text-[#1f1712] prose-headings:font-semibold prose-headings:text-[#1f1712] prose-p:my-2 prose-p:text-[#1f1712] prose-li:text-[#1f1712] prose-li:my-0.5 prose-strong:text-[#1f1712] prose-a:text-primary prose-code:text-[#1f1712] prose-blockquote:text-[#6b5d4f] prose-th:text-[#1f1712] prose-td:text-[#1f1712]">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{ table: ({ children }) => <div className="my-3 overflow-x-auto"><table className="my-0 min-w-full">{children}</table></div> }}
              >
                {ext === "txt" ? preserveLineBreaks(sourceDraft) : sourceDraft}
              </ReactMarkdown>
            </article>
          ) : (
          <div className="relative overflow-hidden rounded-lg border border-border-light bg-[#faf9f7]">
            <SyntaxHighlighter language={languageFor(ext)} style={oneLight} customStyle={{ margin: 0, minHeight: "20rem", padding: "1rem", fontSize: "13px", lineHeight: "24px", background: "#faf9f7", whiteSpace: "pre-wrap", wordBreak: "break-word" }} codeTagProps={{ style: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } }}>
              {sourceDraft ? `${sourceDraft}\n` : " "}
            </SyntaxHighlighter>
            <textarea value={sourceDraft} onChange={(event) => updateSource(event.target.value)} spellCheck={false} wrap="soft" className="absolute inset-0 h-full w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent p-4 font-mono text-[13px] leading-6 text-transparent caret-[#1f2328] outline-none selection:bg-primary/30" aria-label="Edit source file" />
          </div>
          )}
        </div>
      )}
    </AnnotatedSheet>
  );
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

/** Wide tables are shrunk to fit the sheet instead of scrolling sideways,
 *  so ink drawn on them stays where it was put. */
function FitWidth({ children }: { children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement | null>(null);
  const inner = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState({ scale: 1, height: 0 });
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const update = () => {
      const scale = Math.min(1, o.clientWidth / Math.max(1, i.scrollWidth));
      setFit({ scale, height: i.offsetHeight * scale });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(i);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={outer} style={{ height: fit.height || undefined }} className="overflow-hidden">
      <div ref={inner} className="w-max origin-top-left" style={{ transform: `scale(${fit.scale})` }}>{children}</div>
    </div>
  );
}

function FileCard({ ext, title, url, message }: { ext: string; title: string; url?: string; message: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-border-light bg-[#faf9f7] px-6 py-10 text-center">
      <FileIcon className="text-[#6b5d4f]" size={34} />
      <p className="text-base font-semibold text-[#1f1712]">{title}</p>
      {ext && <span className="rounded bg-[#efe9e1] px-2 py-0.5 text-xs font-medium uppercase text-[#6b5d4f]">.{ext}</span>}
      <p className="text-sm text-[#6b5d4f]">{message}</p>
      {url && <a href={url} download className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary-hover"><Download size={15} /> Download file</a>}
    </div>
  );
}

function MediaPlayer({ kind, url }: { kind: "audio" | "video"; url?: string }) {
  if (!url) return null;
  return kind === "audio"
    ? <audio controls preload="metadata" src={url} className="w-full" />
    : <video controls preload="metadata" src={url} className="max-h-[640px] w-full rounded-lg bg-black" />;
}

function tableHtml(rows: unknown[][]): string {
  const esc = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
  return `<table><tbody>${rows.map((row) => `<tr>${row.slice(0, 80).map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
