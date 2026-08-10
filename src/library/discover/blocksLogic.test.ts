// src/library/discover/blocksLogic.test.ts
import { describe, expect, it } from "vitest";
import {
  canPlace,
  clearLines,
  createEmptyBoard,
  getFullLines,
  hasAnyValidPlacement,
  placeShape,
  resolveDropAnchor,
  type RectLike,
} from "./blocksLogic";
import type { Board, HandPiece, PieceShape } from "./blocksTypes";

const single: PieceShape = { id: "single", cells: [[0, 0]] };
const dominoH: PieceShape = { id: "domino-h", cells: [[0, 0], [0, 1]] };
const dominoV: PieceShape = { id: "domino-v", cells: [[0, 0], [1, 0]] };

function fillCell(board: Board, row: number, col: number, color: "blue" = "blue"): Board {
  const next = board.map((r) => r.map((c) => ({ ...c })));
  next[row][col] = { filled: true, color };
  return next;
}

describe("createEmptyBoard", () => {
  it("creates an 8x8 board of empty cells by default", () => {
    const board = createEmptyBoard();
    expect(board).toHaveLength(8);
    for (const row of board) {
      expect(row).toHaveLength(8);
      for (const cell of row) expect(cell).toEqual({ filled: false, color: null });
    }
  });

  it("honors a custom size", () => {
    const board = createEmptyBoard(3);
    expect(board).toHaveLength(3);
    expect(board[0]).toHaveLength(3);
  });
});

describe("canPlace", () => {
  it("allows placing on an empty board within bounds", () => {
    const board = createEmptyBoard();
    expect(canPlace(dominoH, 0, 0, board)).toBe(true);
    expect(canPlace(dominoH, 7, 6, board)).toBe(true);
  });

  it("rejects placement that goes out of bounds", () => {
    const board = createEmptyBoard();
    expect(canPlace(dominoH, 0, 7, board)).toBe(false); // col 8 is out of bounds
    expect(canPlace(dominoV, 7, 0, board)).toBe(false); // row 8 is out of bounds
    expect(canPlace(single, -1, 0, board)).toBe(false);
  });

  it("rejects placement that overlaps a filled cell", () => {
    const board = fillCell(createEmptyBoard(), 0, 1);
    expect(canPlace(dominoH, 0, 0, board)).toBe(false); // covers (0,0) and (0,1)
    expect(canPlace(single, 0, 1, board)).toBe(false);
  });

  it("allows placement that fits around a filled cell", () => {
    const board = fillCell(createEmptyBoard(), 0, 1);
    expect(canPlace(single, 0, 0, board)).toBe(true);
    expect(canPlace(single, 0, 2, board)).toBe(true);
  });
});

describe("placeShape", () => {
  it("fills the shape's cells with the given color and returns a new board", () => {
    const board = createEmptyBoard();
    const next = placeShape(dominoH, 2, 3, board, "green");
    expect(next[2][3]).toEqual({ filled: true, color: "green" });
    expect(next[2][4]).toEqual({ filled: true, color: "green" });
    // Original board is untouched (immutability)
    expect(board[2][3]).toEqual({ filled: false, color: null });
  });

  it("leaves cells outside the shape unchanged", () => {
    const board = createEmptyBoard();
    const next = placeShape(single, 0, 0, board, "blue");
    expect(next[0][1]).toEqual({ filled: false, color: null });
  });
});

describe("getFullLines", () => {
  it("returns no lines for an empty board", () => {
    expect(getFullLines(createEmptyBoard())).toEqual({ rows: [], cols: [] });
  });

  it("detects a fully-filled row and a fully-filled column", () => {
    let board = createEmptyBoard(3);
    // Fill row 1 entirely
    for (let c = 0; c < 3; c += 1) board = fillCell(board, 1, c);
    // Fill column 2 entirely
    for (let r = 0; r < 3; r += 1) board = fillCell(board, r, 2);
    const { rows, cols } = getFullLines(board);
    expect(rows).toEqual([1]);
    expect(cols).toEqual([2]);
  });

  it("does not report a row that's missing one cell", () => {
    let board = createEmptyBoard(3);
    board = fillCell(board, 0, 0);
    board = fillCell(board, 0, 1);
    expect(getFullLines(board)).toEqual({ rows: [], cols: [] });
  });
});

describe("clearLines", () => {
  it("empties every cell in the given rows and columns", () => {
    let board = createEmptyBoard(3);
    for (let c = 0; c < 3; c += 1) board = fillCell(board, 1, c);
    for (let r = 0; r < 3; r += 1) board = fillCell(board, r, 2);

    const cleared = clearLines(board, [1], [2]);
    for (let c = 0; c < 3; c += 1) expect(cleared[1][c]).toEqual({ filled: false, color: null });
    for (let r = 0; r < 3; r += 1) expect(cleared[r][2]).toEqual({ filled: false, color: null });
  });

  it("leaves untouched rows/columns as they were", () => {
    let board = createEmptyBoard(3);
    board = fillCell(board, 0, 0);
    const cleared = clearLines(board, [1], []);
    expect(cleared[0][0]).toEqual({ filled: true, color: "blue" });
  });

  it("is a no-op (besides returning a fresh board) when given no lines", () => {
    const board = fillCell(createEmptyBoard(3), 0, 0);
    const cleared = clearLines(board, [], []);
    expect(cleared).toEqual(board);
  });
});

function piece(shape: PieceShape): HandPiece {
  return { instanceId: `test-${shape.id}`, shape, color: "blue" };
}

describe("hasAnyValidPlacement", () => {
  it("is true when the board is empty", () => {
    expect(hasAnyValidPlacement([piece(single)], createEmptyBoard())).toBe(true);
  });

  it("is true when at least one hand piece fits somewhere", () => {
    let board = createEmptyBoard(2);
    board = fillCell(board, 0, 0);
    board = fillCell(board, 0, 1);
    board = fillCell(board, 1, 0);
    // Only (1,1) is open — a single fits, a domino does not.
    expect(hasAnyValidPlacement([piece(dominoH), piece(single)], board)).toBe(true);
  });

  it("is false when no hand piece fits anywhere (board full)", () => {
    let board = createEmptyBoard(2);
    board = fillCell(board, 0, 0);
    board = fillCell(board, 0, 1);
    board = fillCell(board, 1, 0);
    board = fillCell(board, 1, 1);
    expect(hasAnyValidPlacement([piece(single)], board)).toBe(false);
  });

  it("is false for an empty hand", () => {
    expect(hasAnyValidPlacement([], createEmptyBoard())).toBe(false);
  });
});

describe("resolveDropAnchor", () => {
  const CELL = 50;

  function boardRect(row: number, col: number): RectLike {
    return { left: col * CELL, top: row * CELL, right: col * CELL + CELL, bottom: row * CELL + CELL };
  }

  function pieceRect(dr: number, dc: number, anchorRow: number, anchorCol: number, offsetX = 0, offsetY = 0): RectLike {
    const left = (anchorCol + dc) * CELL + offsetX;
    const top = (anchorRow + dr) * CELL + offsetY;
    return { left, top, right: left + CELL, bottom: top + CELL };
  }

  it("returns the anchor when every cell fully overlaps its target board cell", () => {
    const board = createEmptyBoard();
    const anchorRow = 2;
    const anchorCol = 3;
    const getPieceCellRect = (dr: number, dc: number) => pieceRect(dr, dc, anchorRow, anchorCol);
    const getBoardCellRect = (row: number, col: number) => boardRect(row, col);

    expect(resolveDropAnchor(dominoH, getPieceCellRect, getBoardCellRect, board)).toEqual({
      row: anchorRow,
      col: anchorCol,
    });
  });

  it("still resolves the anchor when a non-reference cell's rect is misaligned, since only the reference cell's overlap matters", () => {
    const board = createEmptyBoard();
    const anchorRow = 2;
    const anchorCol = 3;
    // dominoH's reference cell [0,0] is perfectly aligned; its second cell [0,1] is shifted 10px (80% overlap) — no longer checked.
    const getPieceCellRect = (dr: number, dc: number) =>
      dc === 1 ? pieceRect(dr, dc, anchorRow, anchorCol, 10, 0) : pieceRect(dr, dc, anchorRow, anchorCol);
    const getBoardCellRect = (row: number, col: number) => boardRect(row, col);

    expect(resolveDropAnchor(dominoH, getPieceCellRect, getBoardCellRect, board)).toEqual({
      row: anchorRow,
      col: anchorCol,
    });
  });

  it("resolves the anchor even when the reference cell only partially overlaps its nearest board cell (no overlap threshold)", () => {
    const board = createEmptyBoard();
    const anchorRow = 2;
    const anchorCol = 3;
    const [dr0, dc0] = dominoH.cells[0]; // [0, 0] — the reference cell, shifted 20px: only 60% overlap with its nearest cell, well below the old 90% threshold.
    const getPieceCellRect = (dr: number, dc: number) =>
      dr === dr0 && dc === dc0 ? pieceRect(dr, dc, anchorRow, anchorCol, 20, 0) : pieceRect(dr, dc, anchorRow, anchorCol);
    const getBoardCellRect = (row: number, col: number) => boardRect(row, col);

    expect(resolveDropAnchor(dominoH, getPieceCellRect, getBoardCellRect, board)).toEqual({
      row: anchorRow,
      col: anchorCol,
    });
  });

  it("rejects when the resolved anchor would place a cell out of bounds", () => {
    const board = createEmptyBoard();
    const anchorRow = 2;
    const anchorCol = 7; // dominoH's second cell (dc=1) would need col 8 — out of an 8-wide board.
    const getPieceCellRect = (dr: number, dc: number) => pieceRect(dr, dc, anchorRow, anchorCol);
    const getBoardCellRect = (row: number, col: number) => boardRect(row, col);

    expect(resolveDropAnchor(dominoH, getPieceCellRect, getBoardCellRect, board)).toBeNull();
  });

  it("rejects when the resolved anchor would overlap an already-filled board cell", () => {
    const board = fillCell(createEmptyBoard(), 2, 4);
    const anchorRow = 2;
    const anchorCol = 3; // dominoH would cover (2,3) and (2,4) — (2,4) is filled.
    const getPieceCellRect = (dr: number, dc: number) => pieceRect(dr, dc, anchorRow, anchorCol);
    const getBoardCellRect = (row: number, col: number) => boardRect(row, col);

    expect(resolveDropAnchor(dominoH, getPieceCellRect, getBoardCellRect, board)).toBeNull();
  });

  it("returns null when the reference cell's rect can't be measured", () => {
    const board = createEmptyBoard();
    expect(resolveDropAnchor(dominoH, () => null, () => boardRect(0, 0), board)).toBeNull();
  });

  it("still resolves the anchor when a non-reference cell has zero area, since only the reference cell's area matters", () => {
    const board = createEmptyBoard();
    const anchorRow = 2;
    const anchorCol = 3;
    // dominoH's second cell (dc=1) has zero width (left === right) — no longer checked.
    const getPieceCellRect = (dr: number, dc: number) => {
      if (dc === 1) {
        const left = (anchorCol + dc) * CELL;
        return { left, top: anchorRow * CELL, right: left, bottom: anchorRow * CELL + CELL };
      }
      return pieceRect(dr, dc, anchorRow, anchorCol);
    };
    const getBoardCellRect = (row: number, col: number) => boardRect(row, col);

    expect(resolveDropAnchor(dominoH, getPieceCellRect, getBoardCellRect, board)).toEqual({
      row: anchorRow,
      col: anchorCol,
    });
  });

  it("rejects when the reference cell has zero area", () => {
    const board = createEmptyBoard();
    const anchorRow = 2;
    const anchorCol = 3;
    const [dr0, dc0] = dominoH.cells[0]; // [0, 0] — the reference cell, given zero width (left === right).
    const getPieceCellRect = (dr: number, dc: number) => {
      if (dr === dr0 && dc === dc0) {
        const left = (anchorCol + dc) * CELL;
        return { left, top: anchorRow * CELL, right: left, bottom: anchorRow * CELL + CELL };
      }
      return pieceRect(dr, dc, anchorRow, anchorCol);
    };
    const getBoardCellRect = (row: number, col: number) => boardRect(row, col);

    expect(resolveDropAnchor(dominoH, getPieceCellRect, getBoardCellRect, board)).toBeNull();
  });
});
