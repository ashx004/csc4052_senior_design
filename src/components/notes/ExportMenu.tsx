"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { downloadBlob, safeName, storedZip, uniqueName, type Entry } from "@/src/library/notes/notebookArchive";
import { exportFileNames, hasMarks, jpegPdf, markupToJson, type ExportPage } from "@/src/library/notes/exportMarkup";
import { noteToMarkdown } from "@/src/library/notes/noteText";
import { getNote } from "@/src/library/notes/notesStore";
import type { Note } from "@/src/library/notes/types";
import { canvasBlob, renderExportPage } from "./markupCanvas";

type Action = "pdf" | "png" | "json" | "notes" | "zip" | "md" | "txt";

const ITEMS: { action: Action; label: string; hint: string }[] = [
  { action: "pdf", label: "Marked-up copy (PDF)", hint: "The file with your marks drawn on it" },
  { action: "png", label: "Markup only (PNG)", hint: "Just your marks on transparent pages" },
  { action: "json", label: "Markup data (JSON)", hint: "Every stroke, box and sticker, to keep or reuse" },
  { action: "notes", label: "Written notes (Markdown)", hint: "The notes you typed about this file" },
  { action: "zip", label: "Everything (ZIP)", hint: "Original file, markup layers, data and notes as separate files" },
];

const TYPED_ITEMS: { action: Action; label: string; hint: string }[] = [
  { action: "pdf", label: "PDF", hint: "The pages as written, with your drawings and stickers" },
  { action: "md", label: "Markdown", hint: "Text with headings, lists and formatting" },
  { action: "txt", label: "Plain text", hint: "Just the words" },
  { action: "json", label: "Markup data (JSON)", hint: "Every stroke, box and sticker, to keep or reuse" },
];

/** Text of a typed note, read live from the editor so unsaved edits export. */
export type TypedText = { markdown: () => string; plain: () => string };

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

/** Exports a file note's markup. The original file is never altered: the
 *  marks can leave as their own files, or drawn onto a copy. */
export default function ExportMenu({
  uid,
  note,
  getPages,
  typed,
}: {
  uid: string;
  note: Pick<Note, "id" | "title" | "fileType" | "url">;
  getPages: () => Promise<ExportPage[]>;
  typed?: TypedText;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Action | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const title = safeName(note.title.replace(/\.[A-Za-z0-9]{1,5}$/, "")) || "note";
  const names = exportFileNames(title);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function writtenNotes(): Promise<string> {
    const fresh = await getNote(uid, note.id);
    return (noteToMarkdown(fresh?.content) || fresh?.plainText || "").trim();
  }

  async function markupLayers(pages: ExportPage[]): Promise<Entry[]> {
    const layers: Entry[] = [];
    for (let i = 0; i < pages.length; i++) {
      if (!hasMarks(pages[i].annotations)) continue;
      layers.push({ name: `page-${i + 1}.png`, bytes: await bytesOf(await canvasBlob(await renderExportPage(pages[i], false), "image/png")) });
    }
    return layers;
  }

  async function run(action: Action) {
    setBusy(action);
    setMessage(null);
    try {
      if (typed && (action === "md" || action === "txt")) {
        const text = (action === "md" ? typed.markdown() : typed.plain()).trim();
        if (!text) {
          setMessage("This note has no text yet.");
          return;
        }
        downloadBlob(`${title}.${action}`, new Blob([text], { type: action === "md" ? "text/markdown" : "text/plain" }));
        setOpen(false);
        return;
      }
      const pages = action === "notes" ? [] : await getPages();
      const anyMarks = pages.some((p) => hasMarks(p.annotations));
      if (!anyMarks && (action === "png" || action === "json" || (action === "pdf" && !typed))) {
        setMessage("Nothing is marked up yet. Draw, highlight or add text first.");
        return;
      }

      if (action === "pdf") {
        const rendered = [];
        for (const page of pages) {
          const canvas = await renderExportPage(page, true);
          rendered.push({ jpeg: await bytesOf(await canvasBlob(canvas, "image/jpeg")), pixelWidth: canvas.width, pixelHeight: canvas.height, width: page.width, height: page.height });
        }
        downloadBlob(names.pdf, jpegPdf(rendered));
      } else if (action === "png") {
        const layers = await markupLayers(pages);
        if (layers.length === 1) downloadBlob(names.png, new Blob([layers[0].bytes as BlobPart], { type: "image/png" }));
        else downloadBlob(`${title} - markup.zip`, storedZip(layers));
      } else if (action === "json") {
        downloadBlob(names.json, new Blob([markupToJson({ ...note }, pages)], { type: "application/json" }));
      } else if (action === "notes") {
        const text = await writtenNotes();
        if (!text) {
          setMessage("There are no written notes on this file yet.");
          return;
        }
        downloadBlob(names.notes, new Blob([text], { type: "text/markdown" }));
      } else {
        const seen = new Set<string>();
        const entries: Entry[] = [];
        if (note.url) {
          const response = await fetch(note.url);
          if (!response.ok) throw new Error("Couldn't fetch the original file.");
          const ext = note.fileType ? `.${note.fileType}` : "";
          const original = note.title.toLowerCase().endsWith(ext.toLowerCase()) ? note.title : `${note.title}${ext}`;
          entries.push({ name: `original/${uniqueName(safeName(original), seen)}`, bytes: new Uint8Array(await response.arrayBuffer()) });
        }
        if (anyMarks) {
          for (const layer of await markupLayers(pages)) entries.push({ name: `markup/${layer.name}`, bytes: layer.bytes });
          entries.push({ name: "markup/markup.json", bytes: new TextEncoder().encode(markupToJson({ ...note }, pages)) });
        }
        const text = await writtenNotes();
        if (text) entries.push({ name: "notes.md", bytes: new TextEncoder().encode(text) });
        if (!entries.length) {
          setMessage("There is nothing to export yet.");
          return;
        }
        downloadBlob(names.zip, storedZip(entries));
      }
      setOpen(false);
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error && error.message ? error.message : "The export didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          setMessage(null);
        }}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-border-light bg-bg-container px-3 text-xs font-medium text-text-main shadow-sm hover:bg-bg-warm"
      >
        <Download size={15} /> Export
      </button>
      {open && (
        <div role="menu" aria-label={typed ? "Export note" : "Export markup"} className="absolute right-0 top-11 z-30 w-72 rounded-xl border border-border-light bg-bg-container p-1.5 shadow-lg">
          {(typed ? TYPED_ITEMS : ITEMS).map((item) => (
            <button
              key={item.action}
              type="button"
              role="menuitem"
              disabled={busy !== null}
              onClick={() => void run(item.action)}
              className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-bg-warm disabled:opacity-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-text-main">{item.label}</span>
                <span className="block text-xs text-text-muted">{item.hint}</span>
              </span>
              {busy === item.action && <Loader2 size={15} className="mt-0.5 shrink-0 animate-spin" />}
            </button>
          ))}
          {message && (
            <p role="status" className="px-2.5 pb-1.5 pt-1 text-xs text-text-muted">
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
