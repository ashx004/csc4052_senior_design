"use client";

import { useEffect, useRef, useState } from "react";
import { HIGHLIGHTER_COLORS, HIGHLIGHTER_WIDTH, penStrokeColor, straightLine, strokesTouchedBy, thinPoints, tracePath } from "@/src/library/notes/ink";
import type { InkStroke } from "@/src/library/notes/types";
import type { ToolState } from "./tools";

const ERASER_RADIUS = 8;
/** Holding the pen still this long turns the stroke into a straight line. */
const HOLD_TO_STRAIGHTEN_MS = 650;
/** Ink on a document page: those pages stay light in every theme, so
 *  theme-colored (light-in-dark-mode) ink would vanish on them. */
const DOCUMENT_INK = "#1f2328";

function isDarkTheme(): boolean {
  const root = document.documentElement;
  return root.classList.contains("dark") || root.dataset.theme === "dark";
}

/** Re-renders whenever the site theme changes, so pencil ink (drawn in the
 *  theme's text color) flips with it. */
function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => setVersion((v) => v + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    return () => observer.disconnect();
  }, []);
  return version;
}

export function drawInkStroke(ctx: CanvasRenderingContext2D, stroke: InkStroke, inkColor: string, dark: boolean) {
  const pts = stroke.points;
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = stroke.width;
  if (stroke.tool === "highlighter") {
    const color = HIGHLIGHTER_COLORS.find((c) => c.color === stroke.color) ?? HIGHLIGHTER_COLORS[0];
    // One path per stroke, so a stroke that crosses itself doesn't darken.
    // Multiply keeps text readable through it on light paper; on dark
    // paper multiply would vanish, so it's a screen-blended glow there.
    ctx.globalCompositeOperation = dark ? "screen" : "multiply";
    ctx.strokeStyle = `rgba(${dark ? color.darkRgb : color.rgb}, ${dark ? 0.5 : 0.45})`;
  } else {
    ctx.strokeStyle = penStrokeColor(stroke.color, inkColor, dark);
  }
  ctx.beginPath();
  tracePath(ctx, pts);
  ctx.stroke();
  ctx.restore();
}

/**
 * One page's drawing surface. Strokes are stored in page coordinates
 * (0..width, 0..height), independent of how large the page is on screen.
 * Only captures the pointer when a drawing tool is active, so typing and
 * selecting text underneath work normally otherwise.
 */
export default function InkLayer({
  width,
  height,
  strokes,
  tool,
  onStrokesChange,
  onEraseAt,
  onPointerDownOther,
  surface = "theme",
}: {
  width: number;
  height: number;
  strokes: InkStroke[];
  tool: ToolState;
  onStrokesChange: (next: InkStroke[]) => void;
  /** Eraser also removes non-stroke annotations (text boxes, stickers). */
  onEraseAt?: (x: number, y: number, radius: number) => void;
  /** Text/sticker tools: the page was clicked at (x, y). */
  onPointerDownOther?: (x: number, y: number) => void;
  /** "theme": typed-note paper that follows the site theme. "document": a
   *  light PDF/image page, whatever the theme. */
  surface?: "theme" | "document";
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveRef = useRef<InkStroke | null>(null);
  const erasingRef = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snappedRef = useRef(false);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const themeVersion = useThemeVersion();

  const drawing = tool.mode === "pencil" || tool.mode === "highlighter" || tool.mode === "eraser";
  const capturing = drawing || tool.mode === "text" || tool.mode === "sticker";

  function redraw(extra?: InkStroke | null) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const onDocument = surface === "document";
    const inkColor = onDocument
      ? DOCUMENT_INK
      : getComputedStyle(document.documentElement).getPropertyValue("--color-text-main").trim() || "#1f2937";
    const dark = !onDocument && isDarkTheme();
    // Highlights underneath, pencil on top - otherwise a highlight drawn
    // after writing would tint the writing.
    const all = extra ? [...strokesRef.current, extra] : strokesRef.current;
    all.filter((s) => s.tool === "highlighter").forEach((s) => drawInkStroke(ctx, s, inkColor, dark));
    all.filter((s) => s.tool !== "highlighter").forEach((s) => drawInkStroke(ctx, s, inkColor, dark));
  }

  useEffect(() => {
    redraw(liveRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, width, height, themeVersion]);

  function pagePoint(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const rect = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * width, ((e.clientY - rect.top) / rect.height) * height];
  }

  function eraseAt(x: number, y: number) {
    const hit = strokesTouchedBy(strokesRef.current, [x, y], ERASER_RADIUS);
    if (hit.size) onStrokesChange(strokesRef.current.filter((s) => !hit.has(s.id)));
    onEraseAt?.(x, y, ERASER_RADIUS);
  }

  function handleDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!capturing || e.button !== 0) return;
    e.preventDefault();
    const [x, y] = pagePoint(e);
    if (tool.mode === "text" || tool.mode === "sticker") {
      onPointerDownOther?.(x, y);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool.mode === "eraser") {
      erasingRef.current = true;
      eraseAt(x, y);
      return;
    }
    const highlighter = tool.mode === "highlighter";
    liveRef.current = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      tool: highlighter ? "highlighter" : "pencil",
      color: highlighter ? tool.highlighterColor : tool.pencilColor,
      width: highlighter ? HIGHLIGHTER_WIDTH : tool.pencilWidth,
      points: [x, y],
    };
    redraw(liveRef.current);
  }

  function handleMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (erasingRef.current) {
      const [x, y] = pagePoint(e);
      eraseAt(x, y);
      return;
    }
    const live = liveRef.current;
    if (!live) return;
    // Coalesced events give smooth curves on fast pen/finger movement.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    const rect = e.currentTarget.getBoundingClientRect();
    const toPage = (ev: { clientX: number; clientY: number }): [number, number] => [
      ((ev.clientX - rect.left) / rect.width) * width,
      ((ev.clientY - rect.top) / rect.height) * height,
    ];
    if (snappedRef.current) {
      // Already a straight line: the free end follows the pointer.
      live.points = straightLine(live.points, toPage(events[events.length - 1]));
      redraw(live);
      armHold(live, toPage(events[events.length - 1]));
      return;
    }
    for (const ev of events) live.points.push(...toPage(ev));
    redraw(live);
    armHold(live, toPage(events[events.length - 1]));
  }

  function armHold(live: InkStroke, end: [number, number]) {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (live.points.length < 8 && !snappedRef.current) return;
    holdTimer.current = setTimeout(() => {
      if (liveRef.current !== live) return;
      snappedRef.current = true;
      live.points = straightLine(live.points, end);
      redraw(live);
    }, HOLD_TO_STRAIGHTEN_MS);
  }

  function handleUp() {
    erasingRef.current = false;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    snappedRef.current = false;
    const live = liveRef.current;
    liveRef.current = null;
    if (!live) return;
    onStrokesChange([...strokesRef.current, { ...live, points: thinPoints(live.points) }]);
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      className="absolute inset-0 h-full w-full"
      style={{
        pointerEvents: capturing ? "auto" : "none",
        touchAction: capturing ? "none" : "auto",
        cursor: tool.mode === "eraser" ? "cell" : capturing ? "crosshair" : "default",
      }}
    />
  );
}
