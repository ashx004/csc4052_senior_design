import { PENCIL_WIDTHS } from "@/src/library/notes/ink";
import type { HighlighterColor, PenColor } from "@/src/library/notes/types";

/** "type" = the keyboard/cursor (typed notes) or pointer (documents). */
export type ToolMode = "type" | "pencil" | "highlighter" | "eraser" | "text" | "sticker";

export interface ToolState {
  mode: ToolMode;
  pencilWidth: number;
  pencilColor: PenColor;
  highlighterColor: HighlighterColor;
  sticker: string;
}

export function defaultToolState(): ToolState {
  return { mode: "type", pencilWidth: PENCIL_WIDTHS.default, pencilColor: "ink", highlighterColor: "yellow", sticker: "⭐" };
}
