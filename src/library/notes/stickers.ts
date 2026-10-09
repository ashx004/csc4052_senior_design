// Sticker catalogue and drawing. A sticker is stored as one string: an emoji,
// or "badge:LABEL:color" for a colored text label ("badge:EXAM:red").

export const STICKER_SIZE = { min: 20, default: 40, max: 160, step: 12 };

export type BadgeColor = "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "gray";
export const BADGE_COLORS: Record<BadgeColor, { bg: string; fg: string }> = {
  red: { bg: "#dc2626", fg: "#ffffff" },
  orange: { bg: "#ea580c", fg: "#ffffff" },
  yellow: { bg: "#facc15", fg: "#422006" },
  green: { bg: "#16a34a", fg: "#ffffff" },
  blue: { bg: "#2563eb", fg: "#ffffff" },
  purple: { bg: "#9333ea", fg: "#ffffff" },
  pink: { bg: "#ec4899", fg: "#ffffff" },
  gray: { bg: "#4b5563", fg: "#ffffff" },
};

export const badge = (label: string, color: BadgeColor) => `badge:${label}:${color}`;

export interface StickerPack {
  id: string;
  label: string;
  items: string[];
}

export const STICKER_PACKS: StickerPack[] = [
  {
    id: "labels",
    label: "Labels",
    items: [
      badge("IMPORTANT", "red"),
      badge("EXAM", "orange"),
      badge("REVIEW", "blue"),
      badge("DEFINITION", "purple"),
      badge("EXAMPLE", "green"),
      badge("TODO", "yellow"),
      badge("?", "pink"),
      badge("KEY IDEA", "gray"),
    ],
  },
  {
    id: "study",
    label: "Study",
    items: ["⭐", "✅", "❗", "❓", "💡", "📌", "🎯", "📚", "📝", "🧠", "🔬", "🧪", "🧮", "⏰", "🗓️", "🏆"],
  },
  {
    id: "marks",
    label: "Marks",
    items: ["✔️", "❌", "⚠️", "➡️", "⬅️", "⬆️", "⬇️", "🔁", "🔥", "💯", "🔴", "🟡", "🟢", "🔵", "🟣", "➕"],
  },
  {
    id: "moods",
    label: "Moods",
    items: ["👍", "👎", "👏", "🙌", "💪", "🤔", "😅", "😮", "🎉", "❤️", "😴", "🤯", "🥳", "😎", "☕", "🌟"],
  },
];

export const DEFAULT_STICKER = "⭐";

export function parseBadge(value: string): { label: string; color: BadgeColor } | null {
  if (!value.startsWith("badge:")) return null;
  const rest = value.slice(6);
  const cut = rest.lastIndexOf(":");
  if (cut < 0) return null;
  const color = rest.slice(cut + 1) as BadgeColor;
  return BADGE_COLORS[color] ? { label: rest.slice(0, cut), color } : null;
}

/** Draws a sticker centered on (x, y) - used when flattening annotations
 *  into an exported PDF page. */
export function drawSticker(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number) {
  const b = parseBadge(value);
  ctx.save();
  if (b) {
    const colors = BADGE_COLORS[b.color];
    const fontSize = Math.round(size * 0.34);
    ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
    const width = Math.max(size * 0.8, ctx.measureText(b.label).width + fontSize * 1.2);
    const height = fontSize * 1.9;
    ctx.fillStyle = colors.bg;
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y - height / 2, width, height, height / 2);
    ctx.fill();
    ctx.fillStyle = colors.fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(b.label, x, y + 1);
  } else {
    ctx.font = `${Math.round(size * 0.8)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(value, x, y + size * 0.05);
  }
  ctx.restore();
}
