// src/library/discover/blocksLogic.ts
import { BOARD_SIZE, type Board, type HandPiece, type PieceColor, type PieceShape } from "./blocksTypes";

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
