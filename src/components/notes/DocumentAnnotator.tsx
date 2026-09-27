"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, RotateCcw, Save, X } from "lucide-react";
import { downloadScanArchive } from "@/src/library/notes/notebookArchive";
import { loadDocumentSource, saveDocumentNote } from "@/src/library/notes/notesStore";
import { PENCIL_WIDTHS } from "@/src/library/notes/ink";
import {
  EMPTY_PAGE,
  MAX_PAGES_PER_NOTE,
  PAGE_WIDTH,
  type Note,
  type PageAnnotations,
  type StickerAnnotation,
  type TextAnnotation,
} from "@/src/library/notes/types";
import InkLayer, { drawInkStroke } from "./InkLayer";
import NotesToolbar from "./NotesToolbar";
import { usePageInk } from "./usePageInk";
import { usePaperScale } from "./usePaperScale";
import type { ToolState } from "./tools";

type RenderedPage = { src: string; height: number };
const STICKER_SIZE = 36;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function loadImageSize(url: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth ? Math.round((PAGE_WIDTH * img.naturalHeight) / img.naturalWidth) : PAGE_WIDTH);
    img.onerror = () => resolve(Math.round(PAGE_WIDTH * 1.294)); // letter-shaped fallback
    img.src = url;
  });
}

async function renderPdf(url: string, onProgress: (done: number, total: number) => void): Promise<{ pages: RenderedPage[]; truncated: boolean }> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjsLib.version}`;
  const pdf = await pdfjsLib.getDocument({ url }).promise;
  const total = Math.min(pdf.numPages, MAX_PAGES_PER_NOTE);
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const pages: RenderedPage[] = [];
  for (let n = 1; n <= total; n++) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (PAGE_WIDTH / base.width) * pixelRatio });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
    pages.push({ src: canvas.toDataURL("image/jpeg", 0.85), height: Math.round(viewport.height / pixelRatio) });
    onProgress(n, total);
  }
  return { pages, truncated: pdf.numPages > MAX_PAGES_PER_NOTE };
}

function hitsText(t: TextAnnotation, x: number, y: number, r: number) {
  const width = Math.max(40, Math.min(420, t.text.length * 8.5 + 16));
  return x >= t.x - r && x <= t.x + width + r && y >= t.y - r && y <= t.y + 30 + r;
}
function hitsSticker(s: StickerAnnotation, x: number, y: number, r: number) {
  return Math.abs(x - s.x) <= STICKER_SIZE / 2 + r && Math.abs(y - s.y) <= STICKER_SIZE / 2 + r;
}

/** A PDF, photo or scan in the Notes tab: its pages, with ink, highlights,
 *  text boxes and stickers on top. The file itself is never modified. */
export default function DocumentAnnotator({
  uid,
  note,
  onSaveStateChange,
}: {
  uid: string;
  note: Note;
  onSaveStateChange: (state: "saved" | "saving" | "error") => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scale = usePaperScale(scrollRef);
  const [tool, setTool] = useState<ToolState>({ mode: "type", pencilWidth: PENCIL_WIDTHS.default, highlighterColor: "yellow", sticker: "⭐" });
  const [rendered, setRendered] = useState<RenderedPage[] | null>(null);
  const [progress, setProgress] = useState<string>("Loading document...");
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [showSourceImages, setShowSourceImages] = useState(!note.scan);
  const [transcript, setTranscript] = useState<string | null>(null);
  const transcriptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [downloadingScan, setDownloadingScan] = useState(false);
  const [editingText, setEditingText] = useState<string | null>(null);
  const drag = useRef<{ page: number; kind: "text" | "sticker"; id: string; dx: number; dy: number } | null>(null);
  // Where the item being dragged is right now; committed (and saved, as one
  // undo step) when the pointer is released.
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reload, setReload] = useState(0);
  const ink = usePageInk(uid, note.id);
  // The note object changes on every save (updatedAt); loading the document
  // must only happen when it's a different note, not after each stroke.
  const noteRef = useRef(note);
  noteRef.current = note;

  useEffect(() => {
    onSaveStateChange(ink.saving ? "saving" : "saved");
  }, [ink.saving, onSaveStateChange]);

  useEffect(() => {
    if (!note.scan || !note.url) return;
    let cancelled = false;
    fetch(note.url)
      .then((response) => response.ok ? response.text() : Promise.reject(new Error("Transcript unavailable")))
      .then((value) => !cancelled && setTranscript(value))
      .catch(() => !cancelled && setTranscript("The transcript is still being prepared. You can view the source images in the meantime."));
    return () => { cancelled = true; };
  }, [note.scan, note.url]);

  useEffect(() => () => {
    if (transcriptTimer.current) clearTimeout(transcriptTimer.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = noteRef.current;
        const source = current.annotatedUrl && current.fileType === "pdf"
          ? { kind: "pdf" as const, url: current.annotatedUrl }
          : await loadDocumentSource(uid, current);
        if (source.kind === "unsupported") throw new Error(source.reason);
        if (source.kind === "images") {
          const urls = source.urls.slice(0, MAX_PAGES_PER_NOTE);
          const heights = await Promise.all(urls.map(loadImageSize));
          if (!cancelled) {
            setRendered(urls.map((src, i) => ({ src, height: heights[i] })));
            setTruncated(source.urls.length > MAX_PAGES_PER_NOTE);
          }
        } else {
          const result = await renderPdf(source.url, (done, total) => !cancelled && setProgress(`Preparing page ${done} of ${total}...`));
          if (!cancelled) {
            setRendered(result.pages);
            setTruncated(result.truncated);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "This document couldn't be opened.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, note.id, note.annotatedUrl, reload]);

  const page = (i: number): PageAnnotations => ink.pages[i] ?? EMPTY_PAGE;

  function placeAt(i: number, x: number, y: number) {
    if (tool.mode === "text") {
      const t: TextAnnotation = { id: newId(), x, y: y - 14, text: "" };
      ink.updatePage(i, { ...page(i), texts: [...page(i).texts, t] });
      setEditingText(t.id);
      setTool({ ...tool, mode: "type" });
    } else if (tool.mode === "sticker") {
      ink.updatePage(i, { ...page(i), stickers: [...page(i).stickers, { id: newId(), x, y, emoji: tool.sticker }] });
    }
  }

  function eraseItems(i: number, x: number, y: number, r: number) {
    const p = page(i);
    const texts = p.texts.filter((t) => !hitsText(t, x, y, r));
    const stickers = p.stickers.filter((s) => !hitsSticker(s, x, y, r));
    if (texts.length !== p.texts.length || stickers.length !== p.stickers.length) ink.updatePage(i, { ...p, texts, stickers });
  }

  function setText(i: number, id: string, text: string) {
    const p = page(i);
    ink.updatePage(i, { ...p, texts: p.texts.map((t) => (t.id === id ? { ...t, text } : t)) });
  }

  function removeItem(i: number, kind: "text" | "sticker", id: string) {
    const p = page(i);
    ink.updatePage(i, kind === "text" ? { ...p, texts: p.texts.filter((t) => t.id !== id) } : { ...p, stickers: p.stickers.filter((s) => s.id !== id) });
  }

  function startDrag(e: React.PointerEvent, i: number, kind: "text" | "sticker", id: string, ix: number, iy: number) {
    if (tool.mode !== "type") return;
    const rect = (e.currentTarget.closest("[data-doc-page]") as HTMLElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * PAGE_WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * (rendered?.[i].height ?? 1);
    drag.current = { page: i, kind, id, dx: x - ix, dy: y - iy };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function moveDrag(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !rendered) return;
    const rect = ((e.currentTarget as HTMLElement).closest("[data-doc-page]") as HTMLElement).getBoundingClientRect();
    const h = rendered[d.page].height;
    const x = Math.max(0, Math.min(PAGE_WIDTH, ((e.clientX - rect.left) / rect.width) * PAGE_WIDTH - d.dx));
    const y = Math.max(0, Math.min(h, ((e.clientY - rect.top) / rect.height) * h - d.dy));
    setDragPos({ id: d.id, x, y });
  }

  function endDrag() {
    const d = drag.current;
    drag.current = null;
    const pos = dragPos;
    setDragPos(null);
    if (!d || !pos || pos.id !== d.id) return;
    const p = page(d.page);
    ink.updatePage(
      d.page,
      d.kind === "text"
        ? { ...p, texts: p.texts.map((t) => (t.id === d.id ? { ...t, x: pos.x, y: pos.y } : t)) }
        : { ...p, stickers: p.stickers.map((st) => (st.id === d.id ? { ...st, x: pos.x, y: pos.y } : st)) }
    );
  }

  const at = <T extends { id: string; x: number; y: number }>(item: T): T =>
    dragPos && dragPos.id === item.id ? { ...item, x: dragPos.x, y: dragPos.y } : item;

  async function composePage(pg: RenderedPage, annotations: PageAnnotations): Promise<Blob> {
    const image = new Image();
    image.src = pg.src;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = PAGE_WIDTH * 2;
    canvas.height = pg.height * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.drawImage(image, 0, 0, PAGE_WIDTH, pg.height);
    annotations.strokes.filter((s) => s.tool === "highlighter").forEach((s) => drawInkStroke(ctx, s, "#1f2328", false));
    annotations.strokes.filter((s) => s.tool !== "highlighter").forEach((s) => drawInkStroke(ctx, s, "#1f2328", false));
    ctx.fillStyle = "#1f2328";
    ctx.font = "15px system-ui";
    annotations.texts.forEach((text) => text.text.split("\n").forEach((line, index) => ctx.fillText(line, text.x, text.y + 18 + index * 24)));
    annotations.stickers.forEach((sticker) => ctx.fillText(sticker.emoji, sticker.x - 14, sticker.y + 14));
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Couldn't render a PDF page.")), "image/jpeg", 0.92));
  }

  async function saveAnnotatedPdf() {
    if (!rendered) return;
    setExporting(true);
    onSaveStateChange("saving");
    try {
      const form = new FormData();
      form.append("noteId", note.id);
      for (let index = 0; index < rendered.length; index++) form.append("page", await composePage(rendered[index], page(index)), `page-${index + 1}.jpg`);
      const response = await fetch("/api/notes/annotated-pdf", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok || typeof data.url !== "string") throw new Error(data.error || "Couldn't save the annotated PDF.");
      await ink.clear();
      await saveDocumentNote(uid, note.id, { annotatedUrl: data.url });
      setReload((value) => value + 1);
      onSaveStateChange("saved");
    } catch (error) {
      console.error(error);
      onSaveStateChange("error");
    } finally { setExporting(false); }
  }

  async function resetPdf() {
    setExporting(true);
    try {
      await ink.clear();
      await saveDocumentNote(uid, note.id, { annotatedUrl: null });
      setReload((value) => value + 1);
    } finally { setExporting(false); }
  }

  async function saveTranscript(value: string) {
    if (!note.courseId || !note.resourceId) return;
    try {
      const response = await fetch("/api/ocr-documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, courseId: note.courseId, resourceId: note.resourceId, action: "editTranscript", transcript: value }),
      });
      if (!response.ok) throw new Error("Couldn't save the transcript.");
      onSaveStateChange("saved");
      void fetch("/api/embed-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, courseId: note.courseId, resourceId: note.resourceId }),
      });
    } catch (error) {
      console.error(error);
      onSaveStateChange("error");
    }
  }

  function editTranscript(value: string) {
    setTranscript(value);
    if (transcriptTimer.current) clearTimeout(transcriptTimer.current);
    onSaveStateChange("saving");
    transcriptTimer.current = setTimeout(() => {
      transcriptTimer.current = null;
      void saveTranscript(value);
    }, 750);
  }

  async function downloadScan() {
    if (transcript === null || !rendered) return;
    setDownloadingScan(true);
    try {
      await downloadScanArchive(note.title, transcript, rendered);
    } catch (error) {
      console.error(error);
      onSaveStateChange("error");
    } finally {
      setDownloadingScan(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-border-light bg-bg-container p-6 text-center">
        <p className="text-sm text-text-main">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-[53px] z-10 flex justify-center px-3 py-2">
        <NotesToolbar variant="document" tool={tool} onToolChange={setTool} canUndo={ink.canUndo} onUndo={ink.undo} />
      </div>
      {note.scan && (
        <div className="flex justify-center gap-2 px-3 pb-2">
          <button type="button" onClick={() => setShowSourceImages((show) => !show)} className="rounded-lg border border-border-light bg-bg-container px-3 py-1.5 text-xs font-medium text-text-main hover:bg-bg-warm">
            {showSourceImages ? "View transcript" : "View source images"}
          </button>
          <button type="button" disabled={downloadingScan || transcript === null || !rendered} onClick={() => void downloadScan()} className="flex items-center gap-1.5 rounded-lg border border-border-light bg-bg-container px-3 py-1.5 text-xs font-medium text-text-main disabled:opacity-40">
            <Download size={14} /> {downloadingScan ? "Preparing..." : "Download transcript & images"}
          </button>
        </div>
      )}
      {note.fileType === "pdf" && (
        <div className="flex justify-center gap-2 px-3 pb-2">
          <button type="button" disabled={exporting || !rendered} onClick={() => void saveAnnotatedPdf()} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-text-inverse disabled:opacity-40"><Save size={14} /> {exporting ? "Saving..." : "Save annotated PDF"}</button>
          <a href={note.annotatedUrl || note.url} download className="flex items-center gap-1.5 rounded-lg border border-border-light bg-bg-container px-3 py-1.5 text-xs font-medium text-text-main"><Download size={14} /> Download</a>
          {note.annotatedUrl && <button type="button" disabled={exporting} onClick={() => void resetPdf()} className="flex items-center gap-1.5 rounded-lg border border-border-light bg-bg-container px-3 py-1.5 text-xs font-medium text-text-main disabled:opacity-40"><RotateCcw size={14} /> Reset</button>}
        </div>
      )}
      <div ref={scrollRef} className="px-4 pb-24 pt-2">
        {note.scan && !showSourceImages ? (
          <div className="mx-auto max-w-4xl rounded-lg border border-border-light bg-bg-container p-5 shadow-sm">
            {transcript === null ? <div className="flex items-center gap-2 text-sm text-text-muted"><Loader2 size={16} className="animate-spin" /> Loading transcript...</div> : <textarea value={transcript} onChange={(event) => editTranscript(event.target.value)} spellCheck className="min-h-[65vh] w-full resize-y border-0 bg-transparent font-mono text-sm leading-6 text-text-main outline-none" aria-label="OCR transcript" />}
          </div>
        ) : !rendered ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-sm text-text-muted">
            <Loader2 className="animate-spin" /> {progress}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6">
            {truncated && (
              <p className="rounded-lg bg-bg-warm px-3 py-2 text-xs text-text-muted">
                Showing the first {MAX_PAGES_PER_NOTE} pages - notes are limited to {MAX_PAGES_PER_NOTE} pages.
              </p>
            )}
            {rendered.map((pg, i) => (
              <div key={i} style={{ width: PAGE_WIDTH * scale, height: pg.height * scale }}>
                <div
                  data-doc-page={i}
                  className="relative origin-top-left overflow-hidden rounded-sm bg-white shadow-[0_2px_18px_rgba(0,0,0,0.10)] ring-1 ring-border-light"
                  style={{ width: PAGE_WIDTH, height: pg.height, transform: `scale(${scale})` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pg.src} alt={`Page ${i + 1}`} className="absolute inset-0 h-full w-full select-none" draggable={false} />
                  <InkLayer
                    width={PAGE_WIDTH}
                    height={pg.height}
                    strokes={page(i).strokes}
                    tool={tool}
                    surface="document"
                    onStrokesChange={(strokes) => ink.updatePage(i, { ...page(i), strokes })}
                    onEraseAt={(x, y, r) => eraseItems(i, x, y, r)}
                    onPointerDownOther={(x, y) => placeAt(i, x, y)}
                  />
                  {page(i).texts.map(at).map((t) => (
                    <div
                      key={t.id}
                      className="group absolute"
                      style={{ left: t.x, top: t.y, pointerEvents: tool.mode === "type" ? "auto" : "none" }}
                      onPointerDown={(e) => {
                        // In cursor mode a text annotation is an object to
                        // move. Editing is deliberate (double-click), so a
                        // normal click never reopens the text box.
                        if (editingText !== t.id) startDrag(e, i, "text", t.id, t.x, t.y);
                      }}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                    >
                      <textarea
                        value={t.text}
                        autoFocus={editingText === t.id}
                        readOnly={editingText !== t.id}
                        onPointerDown={(e) => {
                          if (editingText !== t.id) e.preventDefault();
                        }}
                        onDoubleClick={() => setEditingText(t.id)}
                        onFocus={() => setEditingText(t.id)}
                        onBlur={() => {
                          setEditingText(null);
                          if (!t.text.trim()) removeItem(i, "text", t.id);
                        }}
                        onChange={(e) => setText(i, t.id, e.target.value)}
                        placeholder="Type here"
                        rows={Math.max(1, t.text.split("\n").length)}
                        aria-label="Text annotation"
                        className="block min-w-[60px] resize-none rounded border border-transparent bg-[rgba(255,253,235,0.9)] px-1.5 py-0.5 text-[15px] leading-6 text-[#1f2328] outline-none focus:border-[#b08957]"
                        style={{ width: Math.max(80, Math.min(420, t.text.length * 8.5 + 24)) }}
                      />
                      <button
                        type="button"
                        aria-label="Delete text"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeItem(i, "text", t.id);
                        }}
                        className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-[#1f2328] text-white group-hover:flex"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  {page(i).stickers.map(at).map((s) => (
                    <div
                      key={s.id}
                      role="img"
                      aria-label={`Sticker ${s.emoji}`}
                      className="group absolute flex select-none items-center justify-center"
                      style={{
                        left: s.x - STICKER_SIZE / 2,
                        top: s.y - STICKER_SIZE / 2,
                        width: STICKER_SIZE,
                        height: STICKER_SIZE,
                        fontSize: STICKER_SIZE - 6,
                        pointerEvents: tool.mode === "type" ? "auto" : "none",
                        cursor: tool.mode === "type" ? "grab" : "default",
                      }}
                      onPointerDown={(e) => startDrag(e, i, "sticker", s.id, s.x, s.y)}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                    >
                      {s.emoji}
                      <button
                        type="button"
                        aria-label="Delete sticker"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => removeItem(i, "sticker", s.id)}
                        className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-[#1f2328] text-white group-hover:flex"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  <span className="pointer-events-none absolute bottom-3 right-5 text-xs tabular-nums text-black opacity-30">{i + 1}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
