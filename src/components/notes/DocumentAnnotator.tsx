"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, RotateCcw, Save, X } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { downloadScanArchive } from "@/src/library/notes/notebookArchive";
import { loadDocumentSource, saveDocumentNote } from "@/src/library/notes/notesStore";
import { db } from "@/src/library/firebase";
import { isActiveJobStatus, type ActiveJobStatus } from "@/src/library/jobStatus";
import { MAX_ANNOTATED_SAVE_PAGES, MAX_DOCUMENT_PAGES, PAGE_WIDTH, type Note, type PageAnnotations } from "@/src/library/notes/types";
import { STICKER_SIZE, drawSticker } from "@/src/library/notes/stickers";
import AnnotationItems from "./AnnotationItems";
import InkLayer, { drawInkStroke } from "./InkLayer";
import NotesToolbar from "./NotesToolbar";
import ExportMenu, { type ExportSource } from "./ExportMenu";
import { useExportRegistration } from "./noteExportSlot";
import { layoutTranscript, type ExportPage, type TextRun } from "@/src/library/notes/exportMarkup";
import FileNotesEditor from "./FileNotesEditor";
import TranscriptReader from "./TranscriptReader";
import { useAnnotationTools } from "./useAnnotationTools";
import { useMarkShortcuts } from "./useMarkShortcuts";
import { usePageInk } from "./usePageInk";
import { usePaperScale } from "./usePaperScale";
import { FloatingZoom, usePaperZoom } from "./PaperZoom";
import { defaultToolState, type ToolState } from "./tools";
import JobProgressIndicator from "@/src/components/jobs/JobProgressIndicator";
import { drawPdfPage, openImagePages, openPdfPages, pageImage, useNearPages, type DocumentPages } from "./documentPages";

/** A page's own picture: the image, or the PDF page drawn into a canvas, but
 *  only while the page is near the screen. Far-off pages give the memory back. */
function PageBase({ pages, index, live }: { pages: DocumentPages; index: number; live: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (pages.kind !== "pdf" || !live || !canvas) return;
    const draw = drawPdfPage(pages.pdf, index, canvas, Math.min(2, window.devicePixelRatio || 1));
    draw.done.catch((e: unknown) => {
      if ((e as { name?: string })?.name !== "RenderingCancelledException") console.error(e);
    });
    return () => {
      draw.cancel();
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [pages, index, live]);

  if (pages.kind === "pdf") return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full select-none" />;
  // eslint-disable-next-line @next/next/no-img-element
  return live ? <img src={pages.urls[index]} alt={`Page ${index + 1}`} className="absolute inset-0 h-full w-full select-none" draggable={false} /> : null;
}

/** A PDF, photo or scan in the Notes tab: its pages, with ink, highlights,
 *  text boxes and stickers on top. The file itself is never modified. */
const TRANSCRIPT_PENDING = "The transcript is still being prepared. You can view the source images in the meantime.";

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
  const [rendered, setRendered] = useState<DocumentPages | null>(null);
  const [progress, setProgress] = useState<string>("Loading document...");
  const [error, setError] = useState<string | null>(null);
  const [showSourceImages, setShowSourceImages] = useState(!note.scan);
  const [ocrJobStatus, setOcrJobStatus] = useState<ActiveJobStatus | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const transcriptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [downloadingScan, setDownloadingScan] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reload, setReload] = useState(0);
  const { near, observe } = useNearPages();
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

  // A Notes entry contains only a stable reference to its class resource.
  // Subscribe to that source of truth so a preview opened from Notes reflects
  // the same queued/processing OCR state as the course-resource preview.
  useEffect(() => {
    if (!note.scan || !note.courseId || !note.resourceId) {
      setOcrJobStatus(null);
      return;
    }

    return onSnapshot(
      doc(db, "users", uid, "enrollment", note.courseId, "resources", note.resourceId),
      (resource) => {
        const status = resource.data()?.ocrStatus;
        setOcrJobStatus(isActiveJobStatus(status) ? status : null);
      },
      () => setOcrJobStatus(null)
    );
  }, [uid, note.scan, note.courseId, note.resourceId]);

  useEffect(() => {
    if (!note.scan || !note.url) return;
    let cancelled = false;
    fetch(note.url)
      .then((response) => response.ok ? response.text() : Promise.reject(new Error("Transcript unavailable")))
      .then((value) => !cancelled && setTranscript(value))
      .catch(() => !cancelled && setTranscript(TRANSCRIPT_PENDING));
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
        const pages = source.kind === "images"
          ? await openImagePages(source.urls)
          : await openPdfPages(source.url, (done, total) => !cancelled && setProgress(`Reading page ${done} of ${total}...`));
        if (cancelled) {
          if (pages.kind === "pdf") pages.close();
        } else setRendered(pages);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "This document couldn't be opened.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, note.id, note.annotatedUrl, reload]);

  // Release the previous PDF once a reload replaces it, and on leaving the note.
  useEffect(() => () => {
    if (rendered?.kind === "pdf") rendered.close();
  }, [rendered]);

  const page = tools.page;

  /** The scan's transcript as invisible text for each page, so an exported PDF of the
   *  photos can still be searched and copied from. It sits in reading order down the
   *  page rather than on the handwriting itself. */
  function transcriptRuns(): TextRun[][] {
    if (!rendered || !transcript || transcript === TRANSCRIPT_PENDING) return [];
    return layoutTranscript(transcript, PAGE_WIDTH, Math.min(...rendered.heights), rendered.heights.length);
  }

  async function composePage(pages: DocumentPages, index: number, annotations: PageAnnotations): Promise<Blob> {
    const image = await pageImage(pages, index);
    if (!image) throw new Error(`Couldn't load page ${index + 1}.`);
    const height = pages.heights[index];
    const canvas = document.createElement("canvas");
    canvas.width = PAGE_WIDTH * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.drawImage(image, 0, 0, PAGE_WIDTH, height);
    annotations.strokes.filter((s) => s.tool === "highlighter").forEach((s) => drawInkStroke(ctx, s, "#1f2328", false));
    annotations.strokes.filter((s) => s.tool !== "highlighter").forEach((s) => drawInkStroke(ctx, s, "#1f2328", false));
    ctx.fillStyle = "#1f2328";
    ctx.font = "15px system-ui";
    annotations.texts.forEach((text) => text.text.split("\n").forEach((line, index) => ctx.fillText(line, text.x, text.y + 18 + index * 24)));
    annotations.stickers.forEach((sticker) => drawSticker(ctx, sticker.emoji, sticker.x, sticker.y, sticker.size ?? STICKER_SIZE.default));
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Couldn't render a PDF page.")), "image/jpeg", 0.92));
  }

  async function saveAnnotatedPdf() {
    if (!rendered || rendered.heights.length > MAX_ANNOTATED_SAVE_PAGES) return;
    setExporting(true);
    onSaveStateChange("saving");
    try {
      const form = new FormData();
      form.append("noteId", note.id);
      const words = transcriptRuns();
      for (let index = 0; index < rendered.heights.length; index++) {
        form.append("page", await composePage(rendered, index, page(index)), `page-${index + 1}.jpg`);
        form.append("text", JSON.stringify({ width: PAGE_WIDTH, height: rendered.heights[index], runs: words[index] ?? [] }));
      }
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
    if (transcript === null || rendered?.kind !== "images") return;
    setDownloadingScan(true);
    try {
      await downloadScanArchive(note.title, transcript, rendered.urls.map((src) => ({ src })));
    } catch (error) {
      console.error(error);
      onSaveStateChange("error");
    } finally {
      setDownloadingScan(false);
    }
  }

  async function exportPages(): Promise<ExportPage[]> {
    if (!rendered) throw new Error("The pages are still loading.");
    const words = transcriptRuns();
    const pages = rendered;
    return pages.heights.map((height, i) => ({
      width: PAGE_WIDTH,
      height,
      annotations: page(i),
      text: words[i],
      base: () => pageImage(pages, i),
    }));
  }

  if (error) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-border-light bg-bg-container p-6 text-center">
        <p className="text-sm text-text-main">{error}</p>
      </div>
    );
  }

  // Export is offered through the note page's Share dialog once the pages have drawn.
  const exportSource = (): ExportSource | null => (rendered ? { uid, note, getPages: exportPages } : null);
  const inWorkspace = useExportRegistration(exportSource);
  const tooLongToSave = (rendered?.heights.length ?? 0) > MAX_ANNOTATED_SAVE_PAGES;

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
        {!inWorkspace && rendered && <ExportMenu source={exportSource} typedNote={false} />}
      </div>
      {note.scan && (
        <div className="flex justify-center gap-2 px-3 pb-2">
          <button type="button" onClick={() => setShowSourceImages((show) => !show)} className="rounded-lg border border-border-light bg-bg-container px-3 py-1.5 text-xs font-medium text-text-main hover:bg-bg-warm">
            {showSourceImages ? "View transcript" : "View source images"}
          </button>
          <button type="button" disabled={downloadingScan || transcript === null || rendered?.kind !== "images"} onClick={() => void downloadScan()} className="flex items-center gap-1.5 rounded-lg border border-border-light bg-bg-container px-3 py-1.5 text-xs font-medium text-text-main disabled:opacity-40">
            <Download size={14} /> {downloadingScan ? "Preparing..." : "Download transcript & images"}
          </button>
        </div>
      )}
      {ocrJobStatus && (
        <div className="px-3 pb-2">
          <JobProgressIndicator kind="ocr" status={ocrJobStatus} />
        </div>
      )}
      {note.fileType === "pdf" && (
        <div className="flex justify-center gap-2 px-3 pb-2">
          <button type="button" disabled={exporting || !rendered || tooLongToSave} title={tooLongToSave ? `Saving into the PDF works for files up to ${MAX_ANNOTATED_SAVE_PAGES} pages. Use Share → Export to download this one with your markup.` : undefined} onClick={() => void saveAnnotatedPdf()} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-text-inverse disabled:opacity-40"><Save size={14} /> {exporting ? "Saving..." : "Save annotated PDF"}</button>
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
            {rendered.totalPages > rendered.heights.length && (
              <p className="rounded-lg bg-bg-warm px-3 py-2 text-xs text-text-muted">
                Showing the first {MAX_DOCUMENT_PAGES} of {rendered.totalPages} pages.
              </p>
            )}
            {rendered.heights.map((height, i) => {
              // Ink and text layers also mount only near the screen, except a text box mid-edit.
              const live = near.has(i) || (!!tools.editingId && page(i).texts.some((text) => text.id === tools.editingId));
              return (
                <div key={i} ref={observe} data-page-slot={i} style={{ width: PAGE_WIDTH * scale, height: height * scale }}>
                  <div
                    data-doc-page={i}
                    className="relative origin-top-left overflow-hidden rounded-sm bg-white shadow-[0_2px_18px_rgba(0,0,0,0.10)] ring-1 ring-border-light"
                    style={{ width: PAGE_WIDTH, height, transform: `scale(${scale})` }}
                  >
                    <PageBase pages={rendered} index={i} live={live} />
                    {live && (
                      <>
                        <InkLayer
                          width={PAGE_WIDTH}
                          height={height}
                          strokes={page(i).strokes}
                          tool={tool}
                          surface="document"
                          onStrokesChange={(strokes) => tools.setStrokes(i, strokes)}
                          onEraseAt={(x, y, r) => tools.eraseAt(i, x, y, r)}
                          onPointerDownOther={(x, y) => tools.placeAt(i, x, y)}
                        />
                        <AnnotationItems
                          height={height}
                          annotations={page(i)}
                          tool={tool}
                          editingId={tools.editingId}
                          onEditingChange={tools.setEditingId}
                          onChange={(next) => tools.setPage(i, next)}
                        />
                      </>
                    )}
                    <span className="pointer-events-none absolute bottom-3 right-5 text-xs tabular-nums text-black opacity-30">{i + 1}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!(note.scan && !showSourceImages) && <FileNotesEditor uid={uid} note={note} onSaveStateChange={onSaveStateChange} />}
      </div>
    </div>
  );
}
