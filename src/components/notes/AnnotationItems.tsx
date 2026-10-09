"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Pencil, Plus, X } from "lucide-react";
import { BADGE_COLORS, STICKER_SIZE, parseBadge } from "@/src/library/notes/stickers";
import { PAGE_WIDTH, type PageAnnotations, type StickerAnnotation, type TextAnnotation } from "@/src/library/notes/types";
import type { ToolState } from "./tools";

export const newAnnotationId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const stickerSize = (s: StickerAnnotation) => s.size ?? STICKER_SIZE.default;

function hitsText(t: TextAnnotation, x: number, y: number, r: number) {
  const width = Math.max(40, Math.min(420, t.text.length * 8.5 + 16));
  return x >= t.x - r && x <= t.x + width + r && y >= t.y - r && y <= t.y + 30 + r;
}
function hitsSticker(s: StickerAnnotation, x: number, y: number, r: number) {
  const half = stickerSize(s) / 2;
  return Math.abs(x - s.x) <= half + r && Math.abs(y - s.y) <= half + r;
}

/** The text-box and sticker tools: what a click at (x, y) adds. */
export function placeAnnotation(
  tool: ToolState,
  page: PageAnnotations,
  x: number,
  y: number
): { next: PageAnnotations; editId?: string } | null {
  if (tool.mode === "text") {
    const t: TextAnnotation = { id: newAnnotationId(), x, y: y - 14, text: "" };
    return { next: { ...page, texts: [...page.texts, t] }, editId: t.id };
  }
  if (tool.mode === "sticker") {
    return { next: { ...page, stickers: [...page.stickers, { id: newAnnotationId(), x, y, emoji: tool.sticker }] } };
  }
  return null;
}

/** The eraser also removes the text boxes and stickers it touches. */
export function eraseAnnotations(page: PageAnnotations, x: number, y: number, r: number): PageAnnotations | null {
  const texts = page.texts.filter((t) => !hitsText(t, x, y, r));
  const stickers = page.stickers.filter((s) => !hitsSticker(s, x, y, r));
  return texts.length !== page.texts.length || stickers.length !== page.stickers.length ? { ...page, texts, stickers } : null;
}

function StickerFace({ value, size }: { value: string; size: number }) {
  const b = parseBadge(value);
  if (!b) return <span style={{ fontSize: size * 0.8, lineHeight: 1 }}>{value}</span>;
  const colors = BADGE_COLORS[b.color];
  return (
    <span
      className="whitespace-nowrap rounded-full font-bold"
      style={{ background: colors.bg, color: colors.fg, fontSize: size * 0.34, padding: `${size * 0.17}px ${size * 0.34}px`, lineHeight: 1 }}
    >
      {b.label}
    </span>
  );
}

const controlClass =
  "flex h-6 w-6 items-center justify-center rounded-full bg-[#1f2328] text-white shadow hover:bg-black";

/**
 * Text boxes and stickers of one page, laid over the page in page
 * coordinates. In cursor mode they can be dragged, resized (stickers),
 * edited (text) and deleted; the other tools pass pointers through to the
 * ink layer beneath.
 */
export default function AnnotationItems({
  height,
  annotations,
  tool,
  editingId,
  onEditingChange,
  onChange,
}: {
  height: number;
  annotations: PageAnnotations;
  tool: ToolState;
  editingId: string | null;
  onEditingChange: (id: string | null) => void;
  onChange: (next: PageAnnotations) => void;
}) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ kind: "text" | "sticker"; id: string; dx: number; dy: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const interactive = tool.mode === "type";

  useEffect(() => {
    if (!selected) return;
    const away = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest?.(`[data-annotation-id="${selected}"]`)) setSelected(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [selected]);

  useEffect(() => {
    if (!editingId) return;
    const box = layerRef.current?.querySelector<HTMLTextAreaElement>(`[data-annotation-id="${editingId}"] textarea`);
    if (box && document.activeElement !== box) {
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
    }
  }, [editingId]);

  function pagePoint(e: React.PointerEvent): [number, number] {
    const rect = layerRef.current!.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * PAGE_WIDTH, ((e.clientY - rect.top) / rect.height) * height];
  }

  function startDrag(e: React.PointerEvent, kind: "text" | "sticker", id: string, ix: number, iy: number) {
    if (!interactive) return;
    const [x, y] = pagePoint(e);
    drag.current = { kind, id, dx: x - ix, dy: y - iy };
    setSelected(id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function moveDrag(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const [px, py] = pagePoint(e);
    setDragPos({ id: d.id, x: Math.max(0, Math.min(PAGE_WIDTH, px - d.dx)), y: Math.max(0, Math.min(height, py - d.dy)) });
  }

  function endDrag() {
    const d = drag.current;
    drag.current = null;
    const pos = dragPos;
    setDragPos(null);
    if (!d || !pos || pos.id !== d.id) return;
    onChange(
      d.kind === "text"
        ? { ...annotations, texts: annotations.texts.map((t) => (t.id === d.id ? { ...t, x: pos.x, y: pos.y } : t)) }
        : { ...annotations, stickers: annotations.stickers.map((s) => (s.id === d.id ? { ...s, x: pos.x, y: pos.y } : s)) }
    );
  }

  const at = <T extends { id: string; x: number; y: number }>(item: T): T =>
    dragPos && dragPos.id === item.id ? { ...item, x: dragPos.x, y: dragPos.y } : item;

  const remove = (kind: "text" | "sticker", id: string) =>
    onChange(
      kind === "text"
        ? { ...annotations, texts: annotations.texts.filter((t) => t.id !== id) }
        : { ...annotations, stickers: annotations.stickers.filter((s) => s.id !== id) }
    );

  const resize = (id: string, delta: number) =>
    onChange({
      ...annotations,
      stickers: annotations.stickers.map((s) =>
        s.id === id ? { ...s, size: Math.max(STICKER_SIZE.min, Math.min(STICKER_SIZE.max, stickerSize(s) + delta)) } : s
      ),
    });

  const setText = (id: string, text: string) =>
    onChange({ ...annotations, texts: annotations.texts.map((t) => (t.id === id ? { ...t, text } : t)) });

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-20" data-annotation-layer>
      {annotations.texts.map(at).map((t) => {
        const showControls = interactive && (selected === t.id || editingId === t.id);
        return (
          <div
            key={t.id}
            data-annotation-id={t.id}
            className="group absolute"
            style={{ left: t.x, top: t.y, pointerEvents: interactive ? "auto" : "none" }}
            onPointerDown={(e) => {
              // In cursor mode a text annotation is an object to move.
              // Editing is deliberate (double-click or the edit button).
              if (editingId !== t.id) startDrag(e, "text", t.id, t.x, t.y);
            }}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
          >
            <textarea
              value={t.text}
              autoFocus={editingId === t.id}
              readOnly={editingId !== t.id}
              onPointerDown={(e) => {
                if (editingId !== t.id) e.preventDefault();
              }}
              onDoubleClick={() => onEditingChange(t.id)}
              onFocus={() => onEditingChange(t.id)}
              onBlur={() => {
                onEditingChange(null);
                if (!t.text.trim()) remove("text", t.id);
              }}
              onChange={(e) => setText(t.id, e.target.value)}
              placeholder="Type here"
              rows={Math.max(1, t.text.split("\n").length)}
              aria-label="Text annotation"
              className="block min-w-[60px] resize-none rounded border border-transparent bg-[rgba(255,253,235,0.92)] px-1.5 py-0.5 text-[15px] leading-6 text-[#1f2328] outline-none focus:border-[#b08957]"
              style={{ width: Math.max(80, Math.min(420, t.text.length * 8.5 + 24)) }}
            />
            <div className={`absolute -top-7 right-0 gap-1 ${showControls ? "flex" : "hidden group-hover:flex"}`}>
              <button
                type="button"
                aria-label="Edit text"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onEditingChange(t.id)}
                className={controlClass}
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                aria-label="Delete text"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => remove("text", t.id)}
                className={controlClass}
              >
                <X size={12} />
              </button>
            </div>
          </div>
        );
      })}
      {annotations.stickers.map(at).map((s) => {
        const size = stickerSize(s);
        const showControls = interactive && selected === s.id;
        return (
          <div
            key={s.id}
            data-annotation-id={s.id}
            role="img"
            aria-label={`Sticker ${parseBadge(s.emoji)?.label ?? s.emoji}`}
            className="group absolute flex select-none items-center justify-center"
            style={{
              left: s.x - size / 2,
              top: s.y - size / 2,
              width: size,
              height: size,
              pointerEvents: interactive ? "auto" : "none",
              cursor: interactive ? "grab" : "default",
              touchAction: interactive ? "none" : "auto",
            }}
            onPointerDown={(e) => startDrag(e, "sticker", s.id, s.x, s.y)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
          >
            <StickerFace value={s.emoji} size={size} />
            <div className={`absolute -top-7 left-1/2 -translate-x-1/2 gap-1 ${showControls ? "flex" : "hidden group-hover:flex"}`}>
              <button type="button" aria-label="Smaller sticker" onPointerDown={(e) => e.stopPropagation()} onClick={() => resize(s.id, -STICKER_SIZE.step)} className={controlClass}>
                <Minus size={12} />
              </button>
              <button type="button" aria-label="Bigger sticker" onPointerDown={(e) => e.stopPropagation()} onClick={() => resize(s.id, STICKER_SIZE.step)} className={controlClass}>
                <Plus size={12} />
              </button>
              <button type="button" aria-label="Delete sticker" onPointerDown={(e) => e.stopPropagation()} onClick={() => remove("sticker", s.id)} className={controlClass}>
                <X size={12} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
