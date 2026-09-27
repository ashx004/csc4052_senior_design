import type { InkColor } from "@/src/library/notes/types";

/** "type" = the keyboard/cursor (typed notes) or pointer (documents). */
export type ToolMode = "type" | "pencil" | "highlighter" | "eraser" | "text" | "sticker";

export interface ToolState {
  mode: ToolMode;
  pencilWidth: number;
  highlighterColor: Exclude<InkColor, "ink">;
  sticker: string;
}

export const STICKERS = ["⭐", "✅", "❗", "❓", "💡", "📌", "🔥", "👍", "❤️", "🎯"];
