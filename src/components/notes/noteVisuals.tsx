"use client";

import { useEffect, useRef, useState } from "react";
import { File, FileCode, FileImage, FileSpreadsheet, FileText, FileType, NotebookText, ScanText, type LucideIcon } from "lucide-react";
import { loadDocumentSource } from "@/src/library/notes/notesStore";
import { notePreview } from "@/src/library/notes/noteText";
import type { Note } from "@/src/library/notes/types";

type Family = "typed" | "scan" | "pdf" | "image" | "code" | "sheet" | "doc" | "text" | "other";

const CODE = ["py", "java", "class", "js", "jsx", "ts", "tsx", "c", "h", "cpp", "hpp", "cs", "go", "rs", "rb", "php", "swift", "kt", "sql", "sh", "html", "css", "json", "xml", "yaml", "yml", "ipynb", "r", "m", "asm"];
const SHEET = ["xlsx", "xls", "csv", "tsv", "ods"];
const DOC = ["docx", "doc", "odt", "rtf", "pptx", "ppt", "odp"];
const TEXT = ["txt", "md"];
const IMAGE = ["png", "jpg", "jpeg", "webp", "gif", "heic"];

// Tints stay quiet next to the site's earthy palette; each has a dark-mode pair.
const STYLE: Record<Family, { Icon: LucideIcon; tone: string; label: string }> = {
  typed: { Icon: NotebookText, tone: "bg-bg-warm text-primary", label: "Typed note" },
  scan: { Icon: ScanText, tone: "bg-teal-50 text-teal-700 dark:bg-teal-400/10 dark:text-teal-300", label: "Scan" },
  pdf: { Icon: FileText, tone: "bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300", label: "PDF" },
  image: { Icon: FileImage, tone: "bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300", label: "Image" },
  code: { Icon: FileCode, tone: "bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300", label: "Code" },
  sheet: { Icon: FileSpreadsheet, tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300", label: "Spreadsheet" },
  doc: { Icon: FileType, tone: "bg-indigo-50 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300", label: "Document" },
  text: { Icon: FileText, tone: "bg-stone-100 text-stone-600 dark:bg-stone-400/10 dark:text-stone-300", label: "Text" },
  other: { Icon: File, tone: "bg-stone-100 text-stone-600 dark:bg-stone-400/10 dark:text-stone-300", label: "File" },
};

function familyOf(note: Note): Family {
  if (note.kind === "typed") return "typed";
  if (note.scan) return "scan";
  const ext = (note.fileType ?? "").toLowerCase();
  if (ext === "pdf") return "pdf";
  if (IMAGE.includes(ext)) return "image";
  if (CODE.includes(ext)) return "code";
  if (SHEET.includes(ext)) return "sheet";
  if (DOC.includes(ext)) return "doc";
  if (TEXT.includes(ext)) return "text";
  return "other";
}

/** "Typed note", "Scan", "PDF", or the file's extension for everything else. */
export function noteTypeLabel(note: Note): string {
  const family = familyOf(note);
  if (family === "typed" || family === "scan" || family === "pdf" || family === "image") return STYLE[family].label;
  return note.fileType ? `.${note.fileType.toLowerCase()}` : STYLE[family].label;
}

export function NoteTypeIcon({ note, size = "md" }: { note: Note; size?: "sm" | "md" }) {
  const { Icon, tone } = STYLE[familyOf(note)];
  const box = size === "sm" ? "h-6 w-6 rounded-md" : "h-7 w-7 rounded-lg";
  return (
    <span className={`flex shrink-0 items-center justify-center ${box} ${tone}`} aria-hidden="true">
      <Icon size={size === "sm" ? 13 : 15} />
    </span>
  );
}

// ── Thumbnails ─────────────────────────────────────────────────────────
// Rendered lazily (only once a card scrolls into view), at most two PDFs at
// a time, and kept for the session so going back to the library is instant.

const thumbCache = new Map<string, Promise<string | null>>();
let active = 0;
const waiting: (() => void)[] = [];

async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await task();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

async function renderPdfThumb(url: string): Promise<string | null> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjsLib.version}`;
  const task = pdfjsLib.getDocument({ url });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (360 * Math.min(2, window.devicePixelRatio || 1)) / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.75);
  } finally {
    void task.destroy();
  }
}

function thumbnailFor(uid: string, note: Note): Promise<string | null> {
  const family = familyOf(note);
  if (family !== "pdf" && family !== "image" && family !== "scan") return Promise.resolve(null);
  const key = `${note.id}|${note.url ?? ""}`;
  let job = thumbCache.get(key);
  if (!job) {
    job =
      family === "image" && note.url
        ? Promise.resolve(note.url)
        : family === "pdf" && note.url
          ? limited(() => renderPdfThumb(note.url!))
          : loadDocumentSource(uid, note).then((s) => (s.kind === "images" ? s.urls[0] ?? null : null));
    job = job.catch(() => null);
    thumbCache.set(key, job);
  }
  return job;
}

function TypePlaceholder({ note }: { note: Note }) {
  const { Icon, tone } = STYLE[familyOf(note)];
  return (
    <div className="flex h-full items-center justify-center">
      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}>
        <Icon size={22} />
      </span>
    </div>
  );
}

/** The top half of a note card: a mini page for typed notes, the first page
 *  for PDFs, images and scans, and a type badge for everything else. */
export function NotePreview({ uid, note }: { uid: string; note: Note }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (note.kind === "typed") return;
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        thumbnailFor(uid, note).then((url) => !cancelled && setSrc(url));
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the file changes
  }, [uid, note.id, note.url, note.kind]);

  if (note.kind === "typed") {
    const { heading, body } = notePreview(note);
    return (
      <div className="h-full px-4 pt-3.5">
        {heading && <p className="truncate text-[13px] font-semibold text-text-main">{heading}</p>}
        <p className={`${heading ? "mt-1 line-clamp-3" : "line-clamp-4"} whitespace-pre-line text-xs leading-relaxed text-text-muted`}>
          {body || (heading ? "" : "Empty note")}
        </p>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative h-full">
      {src && !failed ? (
        // Plain <img>: sources are data: URLs and download links, not optimisable assets.
        <img src={src} alt="" draggable={false} onError={() => setFailed(true)} className="h-full w-full object-cover object-top dark:brightness-90" />
      ) : (
        <TypePlaceholder note={note} />
      )}
    </div>
  );
}
