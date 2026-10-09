"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bold,
  Code,
  Eraser,
  Highlighter,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  ListTree,
  MousePointer2,
  Pencil,
  Quote,
  Redo2,
  SeparatorHorizontal,
  Sigma,
  Sticker,
  Strikethrough,
  TextCursorInput,
  Type,
  Underline,
  Undo2,
  WrapText,
} from "lucide-react";
import { HIGHLIGHTER_COLORS, PEN_COLORS, PENCIL_WIDTHS } from "@/src/library/notes/ink";
import { BADGE_COLORS, STICKER_PACKS, parseBadge } from "@/src/library/notes/stickers";
import type { HighlighterColor } from "@/src/library/notes/types";
import type { ToolMode, ToolState } from "./tools";

function ToolButton({
  label,
  active = false,
  disabled = false,
  popover,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  /** For buttons that open a palette: whether it is currently open. */
  popover?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      aria-haspopup={popover === undefined ? undefined : "true"}
      aria-expanded={popover}
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

export type ListKind = "dash" | "dot" | "ordered" | "task";

export interface TextFormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  quote: boolean;
  highlight: boolean;
  heading: 0 | 1 | 2 | 3;
  list: ListKind | null;
  canUndo: boolean;
  canRedo: boolean;
}

export const EMPTY_FORMAT: TextFormatState = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  code: false,
  quote: false,
  highlight: false,
  heading: 0,
  list: null,
  canUndo: false,
  canRedo: false,
};

export type FormatAction =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "code"
  | "quote"
  | "divider"
  | "math"
  | "image"
  | "indent"
  | "outdent"
  | 1
  | 2
  | 3
  | { list: ListKind }
  | { highlight: HighlighterColor | null };

type Popover = "pencil" | "highlighter" | "sticker" | "highlight" | null;

export default function NotesToolbar({
  variant,
  tool,
  onToolChange,
  format,
  onFormat,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onTextUndo,
  onTextRedo,
  showContents,
  onToggleContents,
  onSkipLine,
}: {
  variant: "typed" | "document";
  tool: ToolState;
  onToolChange: (next: ToolState) => void;
  format?: TextFormatState;
  onFormat?: (action: FormatAction) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onTextUndo?: () => void;
  onTextRedo?: () => void;
  showContents?: boolean;
  onToggleContents?: () => void;
  /** Inserts a visible blank line without requiring repeated Enter presses. */
  onSkipLine?: () => void;
}) {
  const [popover, setPopover] = useState<Popover>(null);
  const [packId, setPackId] = useState(STICKER_PACKS[0].id);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!popover) return;
    const close = (e: Event) => {
      if (!barRef.current?.contains(e.target as Node)) setPopover(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [popover]);

  const setMode = (mode: ToolMode) => onToolChange({ ...tool, mode });
  const typing = tool.mode === "type";
  // Typing has its own history; every other tool undoes marks (ink, text boxes, stickers).
  const textHistory = variant === "typed" && typing;
  const pack = STICKER_PACKS.find((p) => p.id === packId) ?? STICKER_PACKS[0];
  const penRgb = PEN_COLORS.find((c) => c.color === tool.pencilColor)?.rgb;
  const markerRgb = HIGHLIGHTER_COLORS.find((c) => c.color === tool.highlighterColor)?.rgb;
  const act = (a: FormatAction) => onFormat?.(a);

  return (
    // Popovers sit outside the scrolling row - overflow-x-auto would clip them.
    // w-fit: as a flex item this wrapper would otherwise shrink to 0px on
    // phones (a scroll container's min-content width is 0) and hide the bar.
    <div ref={barRef} className="relative w-fit max-w-full" data-tutorial="note-toolbar">
      <div className="flex items-center gap-0.5 overflow-x-auto rounded-2xl border border-border-light bg-bg-container px-2 py-1.5 shadow-sm">
        <ToolButton label={variant === "typed" ? "Type" : "Select and move"} active={typing} onClick={() => setMode("type")}>
          {variant === "typed" ? <Type size={17} /> : <MousePointer2 size={17} />}
        </ToolButton>

        <Divider />
        <ToolButton
          label={textHistory ? "Undo typing (Ctrl+Z)" : "Undo (Ctrl+Z)"}
          disabled={textHistory ? !format?.canUndo : !canUndo}
          onClick={() => (textHistory ? onTextUndo?.() : onUndo())}
        >
          <Undo2 size={17} />
        </ToolButton>
        <ToolButton
          label={textHistory ? "Redo typing (Ctrl+Shift+Z)" : "Redo (Ctrl+Shift+Z)"}
          disabled={textHistory ? !format?.canRedo : !canRedo}
          onClick={() => (textHistory ? onTextRedo?.() : onRedo())}
        >
          <Redo2 size={17} />
        </ToolButton>

        {variant === "typed" && format && onFormat && (
          <>
            <Divider />
            <ToolButton label="Bold (Ctrl+B)" active={format.bold} disabled={!typing} onClick={() => act("bold")}>
              <Bold size={17} />
            </ToolButton>
            <ToolButton label="Italic (Ctrl+I)" active={format.italic} disabled={!typing} onClick={() => act("italic")}>
              <Italic size={17} />
            </ToolButton>
            <ToolButton label="Underline (Ctrl+U)" active={format.underline} disabled={!typing} onClick={() => act("underline")}>
              <Underline size={17} />
            </ToolButton>
            <ToolButton label="Strikethrough" active={format.strike} disabled={!typing} onClick={() => act("strike")}>
              <Strikethrough size={17} />
            </ToolButton>
            <div className="relative">
              <ToolButton
                label="Highlight text"
                active={format.highlight}
                disabled={!typing}
                onClick={() => setPopover(popover === "highlight" ? null : "highlight")}
              >
                <span className="rounded px-1 text-xs font-bold text-black" style={{ background: `rgb(${markerRgb ?? "250, 204, 21"})` }}>
                  A
                </span>
              </ToolButton>
            </div>
            <ToolButton label="Inline code" active={format.code} disabled={!typing} onClick={() => act("code")}>
              <Code size={17} />
            </ToolButton>
            <Divider />
            {([1, 2, 3] as const).map((level) => (
              <ToolButton key={level} label={`Heading ${level}`} active={format.heading === level} disabled={!typing} onClick={() => act(level)}>
                <span className="text-xs">H{level}</span>
              </ToolButton>
            ))}
            <Divider />
            <ToolButton label="Dash list (type - and a space)" active={format.list === "dash"} disabled={!typing} onClick={() => act({ list: "dash" })}>
              <span className="text-base leading-none">–</span>
            </ToolButton>
            <ToolButton label="Bullet list (type * and a space)" active={format.list === "dot"} disabled={!typing} onClick={() => act({ list: "dot" })}>
              <List size={17} />
            </ToolButton>
            <ToolButton label="Numbered list (type 1. and a space)" active={format.list === "ordered"} disabled={!typing} onClick={() => act({ list: "ordered" })}>
              <ListOrdered size={17} />
            </ToolButton>
            <ToolButton label="Checklist (type [ ] and a space)" active={format.list === "task"} disabled={!typing} onClick={() => act({ list: "task" })}>
              <ListChecks size={17} />
            </ToolButton>
            <ToolButton label="Indent (Tab)" disabled={!typing} onClick={() => act("indent")}>
              <IndentIncrease size={17} />
            </ToolButton>
            <ToolButton label="Outdent (Shift+Tab)" disabled={!typing} onClick={() => act("outdent")}>
              <IndentDecrease size={17} />
            </ToolButton>
            <Divider />
            <ToolButton label="Equation (type $...$)" disabled={!typing} onClick={() => act("math")}>
              <Sigma size={17} />
            </ToolButton>
            <ToolButton label="Insert picture" disabled={!typing} onClick={() => act("image")}>
              <ImagePlus size={17} />
            </ToolButton>
            <ToolButton label="Quote" active={format.quote} disabled={!typing} onClick={() => act("quote")}>
              <Quote size={17} />
            </ToolButton>
            <ToolButton label="Divider line" disabled={!typing} onClick={() => act("divider")}>
              <SeparatorHorizontal size={17} />
            </ToolButton>
            {onSkipLine && (
              <ToolButton label="Add blank line" disabled={!typing} onClick={onSkipLine}>
                <WrapText size={17} />
              </ToolButton>
            )}
          </>
        )}

        <Divider />
        <div className="flex items-center gap-0.5" data-tutorial="note-draw-tools">
          <ToolButton
            label="Pencil - click again for color and size"
            active={tool.mode === "pencil"}
            popover={popover === "pencil"}
            onClick={() => {
              if (tool.mode === "pencil") setPopover(popover === "pencil" ? null : "pencil");
              else setMode("pencil");
            }}
          >
            <Pencil size={17} />
            {penRgb && <span className="ml-1 h-2 w-2 rounded-full" style={{ background: `rgb(${penRgb})` }} />}
          </ToolButton>
          <ToolButton
            label="Highlighter - click again for color"
            active={tool.mode === "highlighter"}
            popover={popover === "highlighter"}
            onClick={() => {
              if (tool.mode === "highlighter") setPopover(popover === "highlighter" ? null : "highlighter");
              else setMode("highlighter");
            }}
          >
            <Highlighter size={17} />
            <span className="ml-1 h-2 w-2 rounded-full" style={{ background: `rgb(${markerRgb ?? "250, 204, 21"})` }} />
          </ToolButton>
          <ToolButton label="Eraser - removes whole strokes" active={tool.mode === "eraser"} onClick={() => setMode("eraser")}>
            <Eraser size={17} />
          </ToolButton>
        </div>

        <ToolButton label="Text box" active={tool.mode === "text"} onClick={() => setMode("text")}>
          <TextCursorInput size={17} />
          <span className="ml-1.5 hidden text-xs font-medium sm:inline">Text</span>
        </ToolButton>
        <ToolButton
          label="Stickers"
          active={tool.mode === "sticker"}
          popover={popover === "sticker"}
          onClick={() => {
            setMode("sticker");
            setPopover(popover === "sticker" && tool.mode === "sticker" ? null : "sticker");
          }}
        >
          <Sticker size={17} />
          <span className="ml-1.5 hidden text-xs font-medium sm:inline">Sticker</span>
        </ToolButton>

        <Divider />
        {onToggleContents && (
          <ToolButton label="Contents and pages" active={!!showContents} onClick={onToggleContents}>
            <ListTree size={17} />
          </ToolButton>
        )}
      </div>

      {popover === "pencil" && (
        <div className="absolute left-1/2 top-full z-30 mt-2 w-60 -translate-x-1/2 rounded-xl border border-border-light bg-bg-container p-3 shadow-lg">
          <div className="mb-3 flex items-center justify-center gap-2">
            {PEN_COLORS.map((c) => (
              <button
                key={c.color}
                type="button"
                title={c.label}
                aria-label={`${c.label} pen`}
                aria-pressed={tool.pencilColor === c.color}
                onClick={() => onToolChange({ ...tool, mode: "pencil", pencilColor: c.color })}
                className={`h-6 w-6 rounded-full border-2 ${tool.pencilColor === c.color ? "scale-110 border-text-main" : "border-border-light"}`}
                style={{ background: c.rgb ? `rgb(${c.rgb})` : "var(--color-text-main)" }}
              />
            ))}
          </div>
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
            <span className="rounded-full" style={{ width: 60, height: tool.pencilWidth, background: penRgb ? `rgb(${penRgb})` : "var(--color-text-main)" }} />
          </div>
          <p className="mt-2 text-center text-[11px] text-text-muted">Hold still at the end of a line to straighten it.</p>
        </div>
      )}

      {popover === "highlighter" && (
        <div className="absolute left-1/2 top-full z-30 mt-2 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-border-light bg-bg-container p-3 shadow-lg">
          {HIGHLIGHTER_COLORS.map((c) => (
            <button
              key={c.color}
              type="button"
              title={c.label}
              aria-label={`${c.label} highlighter`}
              aria-pressed={tool.highlighterColor === c.color}
              onClick={() => {
                onToolChange({ ...tool, mode: "highlighter", highlighterColor: c.color });
                setPopover(null);
              }}
              className={`h-7 w-7 rounded-full border-2 ${tool.highlighterColor === c.color ? "scale-110 border-text-main" : "border-transparent"}`}
              style={{ background: `rgb(${c.rgb})` }}
            />
          ))}
        </div>
      )}

      {popover === "highlight" && (
        <div className="absolute left-1/2 top-full z-30 mt-2 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-border-light bg-bg-container p-3 shadow-lg">
          {HIGHLIGHTER_COLORS.map((c) => (
            <button
              key={c.color}
              type="button"
              title={`${c.label} highlight`}
              aria-label={`${c.label} text highlight`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onToolChange({ ...tool, highlighterColor: c.color });
                act({ highlight: c.color });
                setPopover(null);
              }}
              className="h-7 w-7 rounded-full border-2 border-transparent hover:border-text-main"
              style={{ background: `rgb(${c.rgb})` }}
            />
          ))}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              act({ highlight: null });
              setPopover(null);
            }}
            className="rounded-lg border border-border-light px-2 py-1 text-xs font-medium text-text-main hover:bg-bg-warm"
          >
            None
          </button>
        </div>
      )}

      {popover === "sticker" && (
        <div className="absolute right-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border-light bg-bg-container p-2 shadow-lg">
          <div className="mb-2 flex gap-1" role="tablist">
            {STICKER_PACKS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={p.id === pack.id}
                onClick={() => setPackId(p.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${p.id === pack.id ? "bg-primary text-text-inverse" : "text-text-main hover:bg-bg-warm"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className={`grid gap-1 ${pack.id === "labels" ? "grid-cols-2" : "grid-cols-6"}`}>
            {pack.items.map((s) => {
              const b = parseBadge(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-label={`Sticker ${b?.label ?? s}`}
                  onClick={() => {
                    onToolChange({ ...tool, mode: "sticker", sticker: s });
                    setPopover(null);
                  }}
                  className={`flex items-center justify-center rounded-lg p-1.5 text-xl hover:bg-bg-warm ${tool.sticker === s ? "bg-bg-warm ring-1 ring-primary" : ""}`}
                >
                  {b ? (
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: BADGE_COLORS[b.color].bg, color: BADGE_COLORS[b.color].fg }}>
                      {b.label}
                    </span>
                  ) : (
                    s
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 px-1 text-[11px] text-text-muted">Tap the page to place one. Switch to Select to move or resize it.</p>
        </div>
      )}
    </div>
  );
}
