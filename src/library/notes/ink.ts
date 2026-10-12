// Pure geometry for the drawing layer (pencil, highlighter, stroke eraser).
import type { HighlighterColor, InkStroke, PenColor } from "./types";

export const PENCIL_WIDTHS = { min: 1, max: 12, default: 3 };
export const HIGHLIGHTER_WIDTH = 18;
// darkRgb: on dark paper a plain yellow wash turns olive, so dark mode
// uses warmer, deeper tints (screen-blended by the ink layer).
export const HIGHLIGHTER_COLORS: { color: HighlighterColor; label: string; rgb: string; darkRgb: string }[] = [
  { color: "yellow", label: "Yellow", rgb: "250, 204, 21", darkRgb: "255, 170, 30" },
  { color: "green", label: "Green", rgb: "74, 222, 128", darkRgb: "40, 200, 140" },
  { color: "pink", label: "Pink", rgb: "244, 114, 182", darkRgb: "240, 100, 170" },
  { color: "orange", label: "Orange", rgb: "251, 146, 60", darkRgb: "255, 130, 50" },
  { color: "blue", label: "Blue", rgb: "96, 165, 250", darkRgb: "70, 140, 255" },
];

/** Pen colors; "ink" is the theme's text color and has no fixed rgb. */
export const PEN_COLORS: { color: PenColor; label: string; rgb: string; darkRgb: string }[] = [
  { color: "ink", label: "Ink", rgb: "", darkRgb: "" },
  { color: "red", label: "Red", rgb: "220, 38, 38", darkRgb: "248, 113, 113" },
  { color: "orange", label: "Orange", rgb: "234, 88, 12", darkRgb: "251, 146, 60" },
  { color: "green", label: "Green", rgb: "22, 163, 74", darkRgb: "74, 222, 128" },
  { color: "blue", label: "Blue", rgb: "37, 99, 235", darkRgb: "96, 165, 250" },
  { color: "purple", label: "Purple", rgb: "147, 51, 234", darkRgb: "192, 132, 252" },
];

/** CSS color for a pencil stroke; `inkColor` is used for the theme ink. */
export function penStrokeColor(color: string, inkColor: string, dark: boolean): string {
  const pen = PEN_COLORS.find((c) => c.color === color);
  if (!pen || !pen.rgb) return inkColor;
  return `rgb(${dark ? pen.darkRgb : pen.rgb})`;
}

/** Traces a smooth curve through the points: quadratic segments that end at
 *  each pair's midpoint, so a hand-drawn line doesn't show its sample
 *  corners. Two points or fewer stay a straight line. */
export function tracePath(ctx: Pick<CanvasRenderingContext2D, "moveTo" | "lineTo" | "quadraticCurveTo">, pts: number[]) {
  ctx.moveTo(pts[0], pts[1]);
  if (pts.length <= 4) {
    ctx.lineTo(pts.length === 2 ? pts[0] + 0.01 : pts[2], pts.length === 2 ? pts[1] : pts[3]);
    return;
  }
  for (let i = 2; i + 3 < pts.length; i += 2) {
    ctx.quadraticCurveTo(pts[i], pts[i + 1], (pts[i] + pts[i + 2]) / 2, (pts[i + 1] + pts[i + 3]) / 2);
  }
  ctx.lineTo(pts[pts.length - 2], pts[pts.length - 1]);
}

/** A held-still stroke becomes a straight line from its start to `end`; a
 *  line that is nearly horizontal or vertical is snapped exactly level. */
export function straightLine(points: number[], end: [number, number]): number[] {
  const [x0, y0] = [points[0], points[1]];
  let [x1, y1] = end;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy);
  if (length > 0) {
    const angle = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
    if (angle < 4) y1 = y0;
    else if (angle > 86) x1 = x0;
  }
  return [x0, y0, x1, y1];
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** True when (x, y) is within `radius` of the stroke's drawn line. */
export function strokeHit(stroke: InkStroke, x: number, y: number, radius: number): boolean {
  const pts = stroke.points;
  const reach = radius + stroke.width / 2;
  if (pts.length === 2) return Math.hypot(x - pts[0], y - pts[1]) <= reach;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    if (distanceToSegment(x, y, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]) <= reach) return true;
  }
  return false;
}

/** The eraser removes whole strokes: every stroke the eraser path touches. */
export function strokesTouchedBy(strokes: InkStroke[], path: number[], radius: number): Set<string> {
  const hit = new Set<string>();
  for (const stroke of strokes) {
    for (let i = 0; i + 1 < path.length; i += 2) {
      if (strokeHit(stroke, path[i], path[i + 1], radius)) {
        hit.add(stroke.id);
        break;
      }
    }
  }
  return hit;
}

/** Drops points closer than `minGap` to the previous kept point and rounds
 *  to 0.1px, which keeps saved strokes small without visibly changing them. */
export function thinPoints(points: number[], minGap = 1.5): number[] {
  if (points.length <= 4) return points.map((v) => Math.round(v * 10) / 10);
  const out = [points[0], points[1]];
  for (let i = 2; i + 1 < points.length; i += 2) {
    const lx = out[out.length - 2];
    const ly = out[out.length - 1];
    const isLast = i + 2 >= points.length;
    if (isLast || Math.hypot(points[i] - lx, points[i + 1] - ly) >= minGap) out.push(points[i], points[i + 1]);
  }
  return out.map((v) => Math.round(v * 10) / 10);
}

/** Lowest y any stroke reaches - used to keep pages that have drawings. */
export function inkBottom(strokes: InkStroke[]): number {
  let max = 0;
  for (const s of strokes) for (let i = 1; i < s.points.length; i += 2) max = Math.max(max, s.points[i] + s.width / 2);
  return max;
}
