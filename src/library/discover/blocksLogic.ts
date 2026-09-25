// src/library/discover/blocksLogic.ts
import { BOARD_SIZE, type Board, type ClearingLines, type HandPiece, type PieceColor, type PieceShape } from "./blocksTypes";

export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function rectArea(r: RectLike): number {
  return Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
}

export function createEmptyBoard(size: number = BOARD_SIZE): Board {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ filled: false, color: null }))
  );
}

export function canPlace(shape: PieceShape, anchorRow: number, anchorCol: number, board: Board): boolean {
  const size = board.length;
  for (const [dr, dc] of shape.cells) {
    const row = anchorRow + dr;
    const col = anchorCol + dc;
    if (row < 0 || row >= size || col < 0 || col >= size) return false;
    if (board[row][col].filled) return false;
  }
  return true;
}

export function placeShape(
  shape: PieceShape,
  anchorRow: number,
  anchorCol: number,
  board: Board,
  color: PieceColor
): Board {
  const next = board.map((row) => row.map((cell) => ({ ...cell })));
  for (const [dr, dc] of shape.cells) {
    next[anchorRow + dr][anchorCol + dc] = { filled: true, color };
  }
  return next;
}

export function getFullLines(board: Board): { rows: number[]; cols: number[] } {
  const size = board.length;
  const rows: number[] = [];
  const cols: number[] = [];

  for (let r = 0; r < size; r += 1) {
    if (board[r].every((cell) => cell.filled)) rows.push(r);
  }
  for (let c = 0; c < size; c += 1) {
    if (board.every((row) => row[c].filled)) cols.push(c);
  }
  return { rows, cols };
}

export function clearLines(board: Board, rows: number[], cols: number[]): Board {
  const rowSet = new Set(rows);
  const colSet = new Set(cols);
  return board.map((row, r) =>
    row.map((cell, c) => (rowSet.has(r) || colSet.has(c) ? { filled: false, color: null } : { ...cell }))
  );
}

export function hasAnyValidPlacement(hand: HandPiece[], board: Board): boolean {
  const size = board.length;
  for (const { shape } of hand) {
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        if (canPlace(shape, row, col, board)) return true;
      }
    }
  }
  return false;
}

/**
 * Resolves where a dragged piece should land. Finds the board cell nearest
 * (by rendered center distance) to the shape's reference cell
 * (`shape.cells[0]`) and anchors the shape there unconditionally — no
 * overlap-area requirement, so the hint snaps to the closest cell even when
 * the piece is only loosely aligned with it. Because tray, overlay, and
 * board cells all render at the same pixel size, a rigid shape's other
 * cells are automatically aligned once the reference cell's anchor is
 * chosen, so no per-cell loop is needed. Returns null if the reference
 * cell's rect can't be measured, if it has zero area, if the resulting
 * anchor would place the shape out of bounds, or if its target cells
 * aren't actually free.
 */
export function resolveDropAnchor(
  shape: PieceShape,
  getPieceCellRect: (dr: number, dc: number) => RectLike | null,
  getBoardCellRect: (row: number, col: number) => RectLike | null,
  board: Board
): { row: number; col: number } | null {
  const [dr0, dc0] = shape.cells[0];
  const refRect = getPieceCellRect(dr0, dc0);
  if (!refRect) return null;
  if (rectArea(refRect) <= 0) return null;

  const refCenterX = (refRect.left + refRect.right) / 2;
  const refCenterY = (refRect.top + refRect.bottom) / 2;

  const size = board.length;
  let bestRow = -1;
  let bestCol = -1;
  let bestDistance = Infinity;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const cellRect = getBoardCellRect(row, col);
      if (!cellRect) continue;
      const cx = (cellRect.left + cellRect.right) / 2;
      const cy = (cellRect.top + cellRect.bottom) / 2;
      const distance = (cx - refCenterX) ** 2 + (cy - refCenterY) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestRow = row;
        bestCol = col;
      }
    }
  }
  if (bestRow === -1) return null;

  const anchorRow = bestRow - dr0;
  const anchorCol = bestCol - dc0;

  if (!canPlace(shape, anchorRow, anchorCol, board)) return null;

  return { row: anchorRow, col: anchorCol };
}

/**
 * Reads the board's live rendered cell size and gap from the DOM (the
 * board's own `[data-row="0"][data-col="0"]`/`[data-row="0"][data-col="1"]`
 * cells). DOM-dependent — not covered by this repo's `node`-environment
 * Vitest setup; returns `null` outside a browser or before the board has
 * mounted.
 */
export function measureBoardCellMetrics(): { size: number; gap: number } | null {
  if (typeof document === "undefined") return null;
  const cell00 = document.querySelector('[data-row="0"][data-col="0"]');
  const cell01 = document.querySelector('[data-row="0"][data-col="1"]');
  if (!cell00 || !cell01) return null;
  const rect00 = cell00.getBoundingClientRect();
  const rect01 = cell01.getBoundingClientRect();
  return { size: rect00.width, gap: rect01.left - rect00.right };
}

/** True when `(row, col)` sits on a row or column currently being cleared. */
export function isCellClearing(row: number, col: number, clearing: ClearingLines | null): boolean {
  if (!clearing) return false;
  return clearing.rows.includes(row) || clearing.cols.includes(col);
}
