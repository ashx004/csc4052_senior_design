// Pure geometry for the drawing layer (pencil, highlighter, stroke eraser).
import type { InkColor, InkStroke } from "./types";

export const PENCIL_WIDTHS = { min: 1, max: 12, default: 3 };
export const HIGHLIGHTER_WIDTH = 18;
export const HIGHLIGHTER_COLORS: { color: Exclude<InkColor, "ink">; label: string; rgb: string }[] = [
  { color: "yellow", label: "Yellow", rgb: "250, 204, 21" },
  { color: "green", label: "Green", rgb: "74, 222, 128" },
  { color: "pink", label: "Pink", rgb: "244, 114, 182" },
];

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
