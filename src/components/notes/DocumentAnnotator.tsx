"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, RotateCcw, Save, X } from "lucide-react";
import { downloadScanArchive } from "@/src/library/notes/notebookArchive";
import { loadDocumentSource, saveDocumentNote } from "@/src/library/notes/notesStore";
import { MAX_PAGES_PER_NOTE, PAGE_WIDTH, type Note, type PageAnnotations } from "@/src/library/notes/types";
import { STICKER_SIZE, drawSticker } from "@/src/library/notes/stickers";
import AnnotationItems from "./AnnotationItems";
import InkLayer, { drawInkStroke } from "./InkLayer";
import NotesToolbar from "./NotesToolbar";
import ExportMenu from "./ExportMenu";
import type { ExportPage } from "@/src/library/notes/exportMarkup";
import FileNotesEditor from "./FileNotesEditor";
import TranscriptReader from "./TranscriptReader";
import { useAnnotationTools } from "./useAnnotationTools";
import { useMarkShortcuts } from "./useMarkShortcuts";
import { usePageInk } from "./usePageInk";
import { usePaperScale } from "./usePaperScale";
import { FloatingZoom, usePaperZoom } from "./PaperZoom";
import { defaultToolState, type ToolState } from "./tools";

type RenderedPage = { src: string; height: number };

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
  const paperZoom = usePaperZoom();
  const scale = usePaperScale(scrollRef, 32, paperZoom.zoom);
  const [tool, setTool] = useState<ToolState>(defaultToolState);
  const [rendered, setRendered] = useState<RenderedPage[] | null>(null);
  const [progress, setProgress] = useState<string>("Loading document...");
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [showSourceImages, setShowSourceImages] = useState(!note.scan);
  const [transcript, setTranscript] = useState<string | null>(null);
  const transcriptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [downloadingScan, setDownloadingScan] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reload, setReload] = useState(0);
  const ink = usePageInk(uid, note.id);
  const tools = useAnnotationTools(ink, tool, setTool);
  useMarkShortcuts(ink.undo, ink.redo);
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

  const page = tools.page;

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
    annotations.stickers.forEach((sticker) => drawSticker(ctx, sticker.emoji, sticker.x, sticker.y, sticker.size ?? STICKER_SIZE.default));
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

  async function exportPages(): Promise<ExportPage[]> {
    if (!rendered) throw new Error("The pages are still loading.");
    return rendered.map((pg, i) => ({
      width: PAGE_WIDTH,
      height: pg.height,
      annotations: page(i),
      base: () =>
        new Promise<CanvasImageSource | null>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = pg.src;
        }),
    }));
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
      <div className="sticky top-[53px] z-10 flex flex-wrap items-center justify-center gap-2 px-3 py-2">
        <NotesToolbar
          variant="document"
          tool={tool}
          onToolChange={setTool}
          canUndo={ink.canUndo}
          canRedo={ink.canRedo}
          onUndo={ink.undo}
          onRedo={ink.redo}
        />
        {rendered && <ExportMenu uid={uid} note={note} getPages={exportPages} />}
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
      {!(note.scan && !showSourceImages) && <FloatingZoom zoom={paperZoom} />}
      <div ref={scrollRef} className="overflow-x-auto px-4 pb-24 pt-2">
        {note.scan && !showSourceImages ? (
          <div className="mx-auto max-w-4xl overflow-hidden rounded-lg border border-border-light bg-bg-container shadow-sm">
            {transcript === null ? <div className="flex items-center gap-2 p-5 text-sm text-text-muted"><Loader2 size={16} className="animate-spin" /> Loading transcript...</div> : <TranscriptReader value={transcript} onChange={editTranscript} label="Transcript" />}
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
                    onStrokesChange={(strokes) => tools.setStrokes(i, strokes)}
                    onEraseAt={(x, y, r) => tools.eraseAt(i, x, y, r)}
                    onPointerDownOther={(x, y) => tools.placeAt(i, x, y)}
                  />
                  <AnnotationItems
                    height={pg.height}
                    annotations={page(i)}
                    tool={tool}
                    editingId={tools.editingId}
                    onEditingChange={tools.setEditingId}
                    onChange={(next) => tools.setPage(i, next)}
                  />
                  <span className="pointer-events-none absolute bottom-3 right-5 text-xs tabular-nums text-black opacity-30">{i + 1}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {!(note.scan && !showSourceImages) && <FileNotesEditor uid={uid} note={note} onSaveStateChange={onSaveStateChange} />}
      </div>
    </div>
  );
}
