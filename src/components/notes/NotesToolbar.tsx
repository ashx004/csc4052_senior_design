"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bold, Eraser, Highlighter, Italic, ListTree, MousePointer2, Pencil, Smile, Type, Undo2 } from "lucide-react";
import { HIGHLIGHTER_COLORS, PENCIL_WIDTHS } from "@/src/library/notes/ink";
import { STICKERS, type ToolMode, type ToolState } from "./tools";

function ToolButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault() /* keep the text selection */}
      onClick={onClick}
      className={`flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg px-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-primary text-text-inverse" : "text-text-main hover:bg-bg-warm"
      }`}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-6 w-px shrink-0 bg-border-light" aria-hidden="true" />;

export interface TextFormatState {
  bold: boolean;
  italic: boolean;
  heading: 0 | 1 | 2 | 3;
}

export default function NotesToolbar({
  variant,
  tool,
  onToolChange,
  format,
  onFormat,
  canUndo,
  onUndo,
  showContents,
  onToggleContents,
}: {
  variant: "typed" | "document";
  tool: ToolState;
  onToolChange: (next: ToolState) => void;
  format?: TextFormatState;
  onFormat?: (action: "bold" | "italic" | 1 | 2 | 3) => void;
  canUndo: boolean;
  onUndo: () => void;
  showContents?: boolean;
  onToggleContents?: () => void;
}) {
  const [popover, setPopover] = useState<"pencil" | "sticker" | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!popover) return;
    const close = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setPopover(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [popover]);

  const setMode = (mode: ToolMode) => onToolChange({ ...tool, mode });

  return (
    // Popovers sit outside the scrolling row - overflow-x-auto would clip them.
    // w-fit: as a flex item this wrapper would otherwise shrink to 0px on
    // phones (a scroll container's min-content width is 0) and hide the bar.
    <div ref={barRef} className="relative w-fit max-w-full" data-tutorial="note-toolbar">
    <div className="flex items-center gap-0.5 overflow-x-auto rounded-2xl border border-border-light bg-bg-container px-2 py-1.5 shadow-sm">
      <ToolButton label={variant === "typed" ? "Type" : "Select"} active={tool.mode === "type"} onClick={() => setMode("type")}>
        {variant === "typed" ? <Type size={17} /> : <MousePointer2 size={17} />}
      </ToolButton>

      {variant === "typed" && format && onFormat && (
        <>
          <Divider />
          <ToolButton label="Bold (Ctrl+B)" active={format.bold} disabled={tool.mode !== "type"} onClick={() => onFormat("bold")}>
            <Bold size={17} />
          </ToolButton>
          <ToolButton label="Italic (Ctrl+I)" active={format.italic} disabled={tool.mode !== "type"} onClick={() => onFormat("italic")}>
            <Italic size={17} />
          </ToolButton>
          {([1, 2, 3] as const).map((level) => (
            <ToolButton
              key={level}
              label={`Heading ${level}`}
              active={format.heading === level}
              disabled={tool.mode !== "type"}
              onClick={() => onFormat(level)}
            >
              <span className="text-xs">H{level}</span>
            </ToolButton>
          ))}
        </>
      )}

      <Divider />
      <div className="relative" data-tutorial="note-draw-tools">
        <div className="flex items-center gap-0.5">
          <ToolButton
            label="Pencil - click again for tip size"
            active={tool.mode === "pencil"}
            onClick={() => {
              if (tool.mode === "pencil") setPopover(popover === "pencil" ? null : "pencil");
              else setMode("pencil");
            }}
          >
            <Pencil size={17} />
          </ToolButton>
          <ToolButton label="Highlighter" active={tool.mode === "highlighter"} onClick={() => setMode("highlighter")}>
            <Highlighter size={17} />
          </ToolButton>
          {HIGHLIGHTER_COLORS.map((c) => (
            <button
              key={c.color}
              type="button"
              title={`${c.label} highlighter`}
              aria-label={`${c.label} highlighter`}
              aria-pressed={tool.mode === "highlighter" && tool.highlighterColor === c.color}
              onClick={() => onToolChange({ ...tool, mode: "highlighter", highlighterColor: c.color })}
              className={`mx-0.5 h-5 w-5 shrink-0 rounded-full border-2 transition-transform ${
                tool.mode === "highlighter" && tool.highlighterColor === c.color ? "scale-110 border-text-main" : "border-transparent"
              }`}
              style={{ backgroundColor: `rgb(${c.rgb})` }}
            />
          ))}
          <ToolButton label="Eraser - removes whole strokes" active={tool.mode === "eraser"} onClick={() => setMode("eraser")}>
            <Eraser size={17} />
          </ToolButton>
        </div>
      </div>

      {variant === "document" && (
        <>
          <ToolButton label="Text box" active={tool.mode === "text"} onClick={() => setMode("text")}>
            <span className="text-xs font-bold">T+</span>
          </ToolButton>
          <ToolButton
            label="Stickers"
            active={tool.mode === "sticker"}
            onClick={() => {
              setMode("sticker");
              setPopover(popover === "sticker" ? null : "sticker");
            }}
          >
            <Smile size={17} />
          </ToolButton>
        </>
      )}

      <Divider />
      <ToolButton label="Undo drawing" disabled={!canUndo} onClick={onUndo}>
        <Undo2 size={17} />
      </ToolButton>
      {onToggleContents && (
        <ToolButton label="Contents" active={!!showContents} onClick={onToggleContents}>
          <ListTree size={17} />
        </ToolButton>
      )}
    </div>

      {popover === "pencil" && (
        <div className="absolute left-1/2 top-full z-30 mt-2 w-56 -translate-x-1/2 rounded-xl border border-border-light bg-bg-container p-3 shadow-lg">
          <label htmlFor="pencil-width" className="flex items-center justify-between text-xs font-medium text-text-muted">
            Tip size <span className="tabular-nums text-text-main">{tool.pencilWidth}px</span>
          </label>
          <input
            id="pencil-width"
            type="range"
            min={PENCIL_WIDTHS.min}
            max={PENCIL_WIDTHS.max}
            value={tool.pencilWidth}
            onChange={(e) => onToolChange({ ...tool, mode: "pencil", pencilWidth: Number(e.target.value) })}
            className="mt-2 w-full accent-primary"
          />
          <div className="mt-2 flex h-6 items-center justify-center">
            <span className="rounded-full bg-text-main" style={{ width: 60, height: tool.pencilWidth }} />
          </div>
        </div>
      )}
      {popover === "sticker" && (
        <div className="absolute right-0 top-full z-30 mt-2 grid w-56 grid-cols-5 gap-1 rounded-xl border border-border-light bg-bg-container p-2 shadow-lg">
          {STICKERS.map((s) => (
            <button
              key={s}
              type="button"
              aria-label={`Sticker ${s}`}
              onClick={() => {
                onToolChange({ ...tool, mode: "sticker", sticker: s });
                setPopover(null);
              }}
              className={`rounded-lg p-1.5 text-xl hover:bg-bg-warm ${tool.sticker === s ? "bg-bg-warm ring-1 ring-primary" : ""}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
