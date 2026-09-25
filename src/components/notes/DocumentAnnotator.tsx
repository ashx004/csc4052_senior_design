"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { loadDocumentSource } from "@/src/library/notes/notesStore";
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
import InkLayer from "./InkLayer";
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
  const [editingText, setEditingText] = useState<string | null>(null);
  const drag = useRef<{ page: number; kind: "text" | "sticker"; id: string; dx: number; dy: number } | null>(null);
  // Where the item being dragged is right now; committed (and saved, as one
  // undo step) when the pointer is released.
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const ink = usePageInk(uid, note.id);
  // The note object changes on every save (updatedAt); loading the document
  // must only happen when it's a different note, not after each stroke.
  const noteRef = useRef(note);
  noteRef.current = note;

  useEffect(() => {
    onSaveStateChange(ink.saving ? "saving" : "saved");
  }, [ink.saving, onSaveStateChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const source = await loadDocumentSource(uid, noteRef.current);
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
  }, [uid, note.id]);

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
      <div ref={scrollRef} className="px-4 pb-24 pt-2">
        {!rendered ? (
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
                        if ((e.target as HTMLElement).tagName !== "TEXTAREA") startDrag(e, i, "text", t.id, t.x, t.y);
                      }}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                    >
                      <textarea
                        value={t.text}
                        autoFocus={editingText === t.id}
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
                        onClick={() => removeItem(i, "text", t.id)}
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
