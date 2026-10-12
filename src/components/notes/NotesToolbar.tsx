"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bold,
  ChevronDown,
  Code,
  Ellipsis,
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
      className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-primary text-text-inverse" : "text-text-main hover:bg-bg-warm"
      }`}
    >
      {children}
    </button>
  );
}

/** A cluster of related buttons in its own pill. The bar wraps between groups, never inside one, so on a narrow screen they stack neatly. */
const Group = ({ children, ...rest }: { children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) => (
  <div className="flex shrink-0 items-center gap-0.5 rounded-xl border border-border-light bg-bg-container px-1 py-1 shadow-sm" {...rest}>
    {children}
  </div>
);

/** One row of a dropdown menu (headings, lists, more): icon or sample, then a plain label. */
function MenuItem({
  label,
  hint,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  /** Longer tooltip, e.g. the Markdown shortcut. */
  hint?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      title={hint ?? label}
      aria-label={hint ?? label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault() /* keep the text selection */}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-primary text-text-inverse" : "text-text-main hover:bg-bg-warm"
      }`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{children}</span>
      <span className="min-w-0 flex-1 whitespace-nowrap">{label}</span>
    </button>
  );
}

/** A dropdown anchored under its button; closes via the toolbar's outside-click handling. */
function Menu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="menu" aria-label={label} className="absolute left-1/2 top-full z-30 mt-2 min-w-44 -translate-x-1/2 rounded-xl border border-border-light bg-bg-container p-1.5 shadow-lg">
      {children}
    </div>
  );
}

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

type Popover = "pencil" | "highlighter" | "sticker" | "highlight" | "heading" | "list" | "more" | null;

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
  // Picking a tool selects it (opening its color/size panel, if it has one);
  // clicking the tool that is already selected puts it away and goes back to typing.
  const toggleTool = (mode: Exclude<ToolMode, "type">, panel: typeof popover = null) => {
    if (tool.mode === mode) {
      setMode("type");
      setPopover(null);
    } else {
      setMode(mode);
      setPopover(panel);
    }
  };
  const typing = tool.mode === "type";
  // Typing has its own history; every other tool undoes marks (ink, text boxes, stickers).
  const textHistory = variant === "typed" && typing;
  const pack = STICKER_PACKS.find((p) => p.id === packId) ?? STICKER_PACKS[0];
  const penRgb = PEN_COLORS.find((c) => c.color === tool.pencilColor)?.rgb;
  const markerRgb = HIGHLIGHTER_COLORS.find((c) => c.color === tool.highlighterColor)?.rgb;
  const act = (a: FormatAction) => onFormat?.(a);

  return (
    // On a narrow screen the groups stack onto more rows rather than scrolling
    // sideways (a scroll container would also clip the dropdowns).
    <div ref={barRef} className="relative w-fit max-w-full" data-tutorial="note-toolbar">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <Group>
        <ToolButton label={variant === "typed" ? "Type" : "Select and move"} active={typing} onClick={() => setMode("type")}>
          {variant === "typed" ? <Type size={16} /> : <MousePointer2 size={16} />}
        </ToolButton>
        <ToolButton
          label={textHistory ? "Undo typing (Ctrl+Z)" : "Undo (Ctrl+Z)"}
          disabled={textHistory ? !format?.canUndo : !canUndo}
          onClick={() => (textHistory ? onTextUndo?.() : onUndo())}
        >
          <Undo2 size={16} />
        </ToolButton>
        <ToolButton
          label={textHistory ? "Redo typing (Ctrl+Shift+Z)" : "Redo (Ctrl+Shift+Z)"}
          disabled={textHistory ? !format?.canRedo : !canRedo}
          onClick={() => (textHistory ? onTextRedo?.() : onRedo())}
        >
          <Redo2 size={16} />
        </ToolButton>
        </Group>

        {variant === "typed" && format && onFormat && (
          <>
            <Group>
            <ToolButton label="Bold (Ctrl+B)" active={format.bold} disabled={!typing} onClick={() => act("bold")}>
              <Bold size={16} />
            </ToolButton>
            <ToolButton label="Italic (Ctrl+I)" active={format.italic} disabled={!typing} onClick={() => act("italic")}>
              <Italic size={16} />
            </ToolButton>
            <ToolButton label="Underline (Ctrl+U)" active={format.underline} disabled={!typing} onClick={() => act("underline")}>
              <Underline size={16} />
            </ToolButton>
            <ToolButton
              label="Highlight text"
              active={format.highlight}
              disabled={!typing}
              popover={popover === "highlight"}
              onClick={() => setPopover(popover === "highlight" ? null : "highlight")}
            >
              <span className="rounded px-1 text-xs font-bold text-black" style={{ background: `rgb(${markerRgb ?? "250, 204, 21"})` }}>
                A
              </span>
            </ToolButton>
            </Group>

            <Group>
            <div className="relative">
              <ToolButton
                label="Heading size"
                active={format.heading > 0}
                disabled={!typing}
                popover={popover === "heading"}
                onClick={() => setPopover(popover === "heading" ? null : "heading")}
              >
                <span className="text-xs font-bold">{format.heading ? `H${format.heading}` : "Aa"}</span>
                <ChevronDown size={12} className="ml-0.5" aria-hidden="true" />
              </ToolButton>
              {popover === "heading" && (
                <Menu label="Heading size">
                  <MenuItem
                    label="Normal text"
                    active={format.heading === 0}
                    onClick={() => {
                      if (format.heading) act(format.heading);
                      setPopover(null);
                    }}
                  >
                    <span className="text-sm">Aa</span>
                  </MenuItem>
                  {([1, 2, 3] as const).map((level) => (
                    <MenuItem
                      key={level}
                      label={`Heading ${level}`}
                      active={format.heading === level}
                      onClick={() => {
                        act(level);
                        setPopover(null);
                      }}
                    >
                      <span className="text-xs font-bold">H{level}</span>
                    </MenuItem>
                  ))}
                </Menu>
              )}
            </div>

            <div className="relative">
              <ToolButton
                label="Lists"
                active={format.list !== null}
                disabled={!typing}
                popover={popover === "list"}
                onClick={() => setPopover(popover === "list" ? null : "list")}
              >
                {format.list === "ordered" ? (
                  <ListOrdered size={16} />
                ) : format.list === "task" ? (
                  <ListChecks size={16} />
                ) : format.list === "dash" ? (
                  <span className="text-base leading-none">–</span>
                ) : (
                  <List size={16} />
                )}
                <ChevronDown size={12} className="ml-0.5" aria-hidden="true" />
              </ToolButton>
              {popover === "list" && (
                <Menu label="Lists">
                  {(
                    [
                      ["dash", "Dash list", "Dash list (type - and a space)", <span key="i" className="text-base leading-none">–</span>],
                      ["dot", "Bullet list", "Bullet list (type * and a space)", <List key="i" size={16} />],
                      ["ordered", "Numbered list", "Numbered list (type 1. and a space)", <ListOrdered key="i" size={16} />],
                      ["task", "Checklist", "Checklist (type [ ] and a space)", <ListChecks key="i" size={16} />],
                    ] as const
                  ).map(([kind, label, hint, icon]) => (
                    <MenuItem
                      key={kind}
                      label={label}
                      hint={hint}
                      active={format.list === kind}
                      onClick={() => {
                        act({ list: kind });
                        setPopover(null);
                      }}
                    >
                      {icon}
                    </MenuItem>
                  ))}
                </Menu>
              )}
            </div>
            <ToolButton label="Indent (Tab)" disabled={!typing} onClick={() => act("indent")}>
              <IndentIncrease size={16} />
            </ToolButton>
            <ToolButton label="Outdent (Shift+Tab)" disabled={!typing} onClick={() => act("outdent")}>
              <IndentDecrease size={16} />
            </ToolButton>

            <div className="relative">
              <ToolButton
                label="More: strikethrough, code, equation, picture, quote, divider, blank line"
                active={format.strike || format.code || format.quote}
                disabled={!typing}
                popover={popover === "more"}
                onClick={() => setPopover(popover === "more" ? null : "more")}
              >
                <Ellipsis size={16} />
              </ToolButton>
              {popover === "more" && (
                <Menu label="More formatting">
                  {(
                    [
                      ["Strikethrough", "Strikethrough", format.strike, <Strikethrough key="i" size={16} />, () => act("strike")],
                      ["Inline code", "Inline code", format.code, <Code key="i" size={16} />, () => act("code")],
                      ["Equation", "Equation (type $...$)", false, <Sigma key="i" size={16} />, () => act("math")],
                      ["Picture", "Insert picture", false, <ImagePlus key="i" size={16} />, () => act("image")],
                      ["Quote", "Quote", format.quote, <Quote key="i" size={16} />, () => act("quote")],
                      ["Divider line", "Divider line", false, <SeparatorHorizontal key="i" size={16} />, () => act("divider")],
                      ...(onSkipLine ? ([["Blank line", "Add blank line", false, <WrapText key="i" size={16} />, onSkipLine]] as const) : []),
                    ] as const
                  ).map(([label, hint, active, icon, run]) => (
                    <MenuItem
                      key={label}
                      label={label}
                      hint={hint}
                      active={active}
                      onClick={() => {
                        run();
                        setPopover(null);
                      }}
                    >
                      {icon}
                    </MenuItem>
                  ))}
                </Menu>
              )}
            </div>
            </Group>
          </>
        )}

        <Group>
        <div className="flex items-center gap-0.5" data-tutorial="note-draw-tools">
          <ToolButton
            label="Pencil - click again to go back to typing"
            active={tool.mode === "pencil"}
            popover={popover === "pencil"}
            onClick={() => toggleTool("pencil", "pencil")}
          >
            <Pencil size={16} />
            {penRgb && <span className="ml-1 h-2 w-2 rounded-full" style={{ background: `rgb(${penRgb})` }} />}
          </ToolButton>
          <ToolButton
            label="Highlighter - click again to go back to typing"
            active={tool.mode === "highlighter"}
            popover={popover === "highlighter"}
            onClick={() => toggleTool("highlighter", "highlighter")}
          >
            <Highlighter size={16} />
            <span className="ml-1 h-2 w-2 rounded-full" style={{ background: `rgb(${markerRgb ?? "250, 204, 21"})` }} />
          </ToolButton>
          <ToolButton label="Eraser - removes whole strokes. Click again to go back to typing" active={tool.mode === "eraser"} onClick={() => toggleTool("eraser")}>
            <Eraser size={16} />
          </ToolButton>
        </div>

        <ToolButton label="Text box - click again to go back to typing" active={tool.mode === "text"} onClick={() => toggleTool("text")}>
          <TextCursorInput size={16} />
          <span className="ml-1.5 hidden text-xs font-medium sm:inline">Text</span>
        </ToolButton>
        <ToolButton
          label="Stickers - click again to go back to typing"
          active={tool.mode === "sticker"}
          popover={popover === "sticker"}
          onClick={() => toggleTool("sticker", "sticker")}
        >
          <Sticker size={16} />
          <span className="ml-1.5 hidden text-xs font-medium sm:inline">Sticker</span>
        </ToolButton>
        </Group>
        {onToggleContents && (
          <Group>
            <ToolButton label="Contents and pages" active={!!showContents} onClick={onToggleContents}>
              <ListTree size={16} />
            </ToolButton>
          </Group>
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
