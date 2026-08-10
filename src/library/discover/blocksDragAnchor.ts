// src/library/discover/blocksDragAnchor.ts
import type { PieceShape } from "./blocksTypes";

/** Matches Tailwind `p-2` on the piece glyph (0.5rem at default root font size). */
export const PIECE_GLYPH_PADDING_PX = 8;

export interface GridSize {
  rows: number;
  cols: number;
}

export interface CellOffset {
  row: number;
  col: number;
}

export interface PlacementAnchor {
  anchorRow: number;
  anchorCol: number;
}

export interface GrabPointerInput {
  pointerX: number;
  pointerY: number;
  left: number;
  top: number;
  width: number;
  height: number;
  paddingPx: number;
  rows: number;
  cols: number;
}

/** Inclusive bounding-box size of a shape's cell grid. */
export function shapeGridSize(shape: PieceShape): GridSize {
  const maxRow = Math.max(...shape.cells.map(([r]) => r));
  const maxCol = Math.max(...shape.cells.map(([, c]) => c));
  return { rows: maxRow + 1, cols: maxCol + 1 };
}

/**
 * Maps a pointer into the piece glyph's cell grid.
 *
 * Derives cell pitch from the measured piece rect so CSS rem/gap changes
 * don't desync the grab math from what the player sees.
 */
export function grabCellFromPointer(input: GrabPointerInput): CellOffset {
  const { pointerX, pointerY, left, top, width, height, paddingPx, rows, cols } = input;
  const contentW = Math.max(width - paddingPx * 2, 1);
  const contentH = Math.max(height - paddingPx * 2, 1);
  // gap is embedded in pitch: content = cell*n + gap*(n-1) → pitch = content/n
  // when treating cells as equal strips (matches CSS grid with equal tracks + gap).
  const pitchX = contentW / cols;
  const pitchY = contentH / rows;

  const relX = pointerX - left - paddingPx;
  const relY = pointerY - top - paddingPx;

  const col = clamp(Math.floor(relX / pitchX), 0, cols - 1);
  const row = clamp(Math.floor(relY / pitchY), 0, rows - 1);
  return { row, col };
}

/**
 * If the grab landed on an empty cell of the shape's bounding box (common for
 * L/S/Z pieces), snap to the nearest filled cell so the preview tracks a real
 * block under the finger.
 */
export function snapGrabToNearestFilledCell(grab: CellOffset, shape: PieceShape): CellOffset {
  const filled = new Set(shape.cells.map(([r, c]) => `${r}-${c}`));
  if (filled.has(`${grab.row}-${grab.col}`)) return grab;

  let best: CellOffset = { row: shape.cells[0][0], col: shape.cells[0][1] };
  let bestDist = Number.POSITIVE_INFINITY;
  for (const [r, c] of shape.cells) {
    const dist = Math.abs(r - grab.row) + Math.abs(c - grab.col);
    if (dist < bestDist) {
      bestDist = dist;
      best = { row: r, col: c };
    }
  }
  return best;
}

/**
 * Convert "board cell under pointer" + "which piece cell is under pointer"
 * into the shape's top-left placement anchor.
 */
export function placementAnchor(hoverRow: number, hoverCol: number, grab: CellOffset): PlacementAnchor {
  return {
    anchorRow: hoverRow - grab.row,
    anchorCol: hoverCol - grab.col,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
