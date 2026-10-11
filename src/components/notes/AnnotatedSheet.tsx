"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MAX_PAGES_PER_NOTE, PAGE_HEIGHT, PAGE_WIDTH, type Note } from "@/src/library/notes/types";
import type { ExportPage } from "@/src/library/notes/exportMarkup";
import ExportMenu from "./ExportMenu";
import { captureElement, sliceCapture } from "./markupCanvas";
import AnnotationItems from "./AnnotationItems";
import InkLayer from "./InkLayer";
import NotesToolbar from "./NotesToolbar";
import PageDecorations from "./PageDecorations";
import { defaultToolState, type ToolState } from "./tools";
import { useAnnotationTools } from "./useAnnotationTools";
import { useMarkShortcuts } from "./useMarkShortcuts";
import { usePageInk } from "./usePageInk";
import { usePaperScale } from "./usePaperScale";
import { FloatingZoom, usePaperZoom } from "./PaperZoom";

/**
 * Any content that can be shown as HTML (a Word file, a spreadsheet, source
 * code) on a paper-width sheet with the same drawing, highlighting, text box
 * and sticker tools as every other note. The sheet is cut into page-high
 * segments; each gets its own ink layer, so annotations stay where they were
 * drawn and the file itself is never touched.
 */
export default function AnnotatedSheet({
  uid,
  noteId,
  onSaveStateChange,
  children,
  below,
  note,
}: {
  uid: string;
  noteId: string;
  note?: Pick<Note, "id" | "title" | "fileType" | "url">;
  onSaveStateChange: (state: "saved" | "saving" | "error") => void;
  children: ReactNode;
  below?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const paperZoom = usePaperZoom();
  const scale = usePaperScale(scrollRef, 32, paperZoom.zoom);
  const [tool, setTool] = useState<ToolState>(defaultToolState);
  const [contentHeight, setContentHeight] = useState(PAGE_HEIGHT);
  const ink = usePageInk(uid, noteId);
  const tools = useAnnotationTools(ink, tool, setTool);
  useMarkShortcuts(ink.undo, ink.redo);

  useEffect(() => {
    onSaveStateChange(ink.saving ? "saving" : "saved");
  }, [ink.saving, onSaveStateChange]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const update = () => setContentHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Marks made on pages past the content (e.g. a page the file used to fill)
  // keep their page, so the sheet never shrinks beneath saved annotations.
  const annotatedPages = Object.entries(ink.pages).reduce(
    (max, [i, p]) => (p.strokes.length || p.texts.length || p.stickers.length ? Math.max(max, Number(i) + 1) : max),
    0
  );
  const pages = Math.min(MAX_PAGES_PER_NOTE, Math.max(1, annotatedPages, Math.ceil(contentHeight / PAGE_HEIGHT)));
  const sheetHeight = pages * PAGE_HEIGHT;

  async function exportPages(): Promise<ExportPage[]> {
    const el = contentRef.current;
    let shot: HTMLCanvasElement | null = null;
    const base = async (i: number) => {
      if (!el) return null;
      shot ??= await captureElement(el);
      return sliceCapture(shot, i, PAGE_WIDTH, PAGE_HEIGHT);
    };
    return Array.from({ length: pages }, (_, i) => ({
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      annotations: tools.page(i),
      base: () => base(i),
    }));
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
        {note && <ExportMenu uid={uid} note={note} getPages={exportPages} />}
      </div>
      <FloatingZoom zoom={paperZoom} />
      <div ref={scrollRef} className="flex-1 overflow-auto px-4 pb-24 pt-2">
        <div className="mx-auto" style={{ width: PAGE_WIDTH * scale, height: sheetHeight * scale }}>
          <div
            className="relative origin-top-left overflow-hidden rounded-sm bg-white shadow-[0_2px_18px_rgba(0,0,0,0.10)] ring-1 ring-border-light"
            style={{ width: PAGE_WIDTH, height: sheetHeight, transform: `scale(${scale})` }}
          >
            <div ref={contentRef} className="office-file-view p-10 text-[#1f1712]">
              {children}
            </div>
            <PageDecorations pages={pages} />
            {Array.from({ length: pages }, (_, i) => (
              <div key={i} className="pointer-events-none absolute left-0 right-0 z-10" style={{ top: i * PAGE_HEIGHT, height: PAGE_HEIGHT }}>
                <InkLayer
                  width={PAGE_WIDTH}
                  height={PAGE_HEIGHT}
                  strokes={tools.page(i).strokes}
                  tool={tool}
                  surface="document"
                  onStrokesChange={(strokes) => tools.setStrokes(i, strokes)}
                  onEraseAt={(x, y, r) => tools.eraseAt(i, x, y, r)}
                  onPointerDownOther={(x, y) => tools.placeAt(i, x, y)}
                />
              </div>
            ))}
            {Array.from({ length: pages }, (_, i) => (
              <div key={`items-${i}`} className="pointer-events-none absolute left-0 right-0 z-20" style={{ top: i * PAGE_HEIGHT, height: PAGE_HEIGHT }}>
                <AnnotationItems
                  height={PAGE_HEIGHT}
                  annotations={tools.page(i)}
                  tool={tool}
                  editingId={tools.editingId}
                  onEditingChange={tools.setEditingId}
                  onChange={(next) => tools.setPage(i, next)}
                />
              </div>
            ))}
          </div>
        </div>
        {below}
      </div>
    </div>
  );
}
