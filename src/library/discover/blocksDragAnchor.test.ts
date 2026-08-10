import { describe, expect, it } from "vitest";
import {
  grabCellFromPointer,
  placementAnchor,
  shapeGridSize,
  snapGrabToNearestFilledCell,
} from "./blocksDragAnchor";
import type { PieceShape } from "./blocksTypes";

const tetrominoO: PieceShape = {
  id: "tetromino-o",
  cells: [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ],
};

const trominoL4: PieceShape = {
  id: "tromino-l-4",
  // Missing (0,0) — top-left of bounding box is empty
  cells: [
    [0, 1],
    [1, 0],
    [1, 1],
  ],
};

describe("shapeGridSize", () => {
  it("returns inclusive max row/col extents for a shape", () => {
    expect(shapeGridSize(tetrominoO)).toEqual({ rows: 2, cols: 2 });
    expect(shapeGridSize(trominoL4)).toEqual({ rows: 2, cols: 2 });
  });
});

describe("grabCellFromPointer", () => {
  // Piece glyph: padding 8px, 2×2 cells of 32px with 2px gap →
  // content 32+2+32 = 66, outer size 8+66+8 = 82.
  const piece = {
    left: 100,
    top: 200,
    width: 82,
    height: 82,
    paddingPx: 8,
    rows: 2,
    cols: 2,
  };

  it("maps the pointer onto the grab cell within the piece grid", () => {
    // Center of bottom-right cell (row 1, col 1):
    // cell origin x = 100+8 + (32+2) = 142, center = 142+16 = 158
    // cell origin y = 200+8 + (32+2) = 242, center = 242+16 = 258
    expect(
      grabCellFromPointer({
        pointerX: 158,
        pointerY: 258,
        ...piece,
      })
    ).toEqual({ row: 1, col: 1 });
  });

  it("clamps to the piece grid when the pointer is in padding", () => {
    expect(
      grabCellFromPointer({
        pointerX: 101,
        pointerY: 201,
        ...piece,
      })
    ).toEqual({ row: 0, col: 0 });
  });
});

describe("snapGrabToNearestFilledCell", () => {
  it("keeps a grab that already lands on a filled cell", () => {
    expect(snapGrabToNearestFilledCell({ row: 0, col: 1 }, trominoL4)).toEqual({ row: 0, col: 1 });
  });

  it("snaps an empty bounding-box cell to the nearest filled cell", () => {
    expect(snapGrabToNearestFilledCell({ row: 0, col: 0 }, trominoL4)).toEqual({ row: 0, col: 1 });
  });
});

describe("placementAnchor", () => {
  it("subtracts the grab offset from the hovered board cell", () => {
    // Holding the bottom-right of a 2×2 while hovering board (3,4)
    // → shape top-left should land at (2,3)
    expect(placementAnchor(3, 4, { row: 1, col: 1 })).toEqual({ anchorRow: 2, anchorCol: 3 });
  });

  it("is identity when grabbing the top-left cell", () => {
    expect(placementAnchor(5, 2, { row: 0, col: 0 })).toEqual({ anchorRow: 5, anchorCol: 2 });
  });
});
