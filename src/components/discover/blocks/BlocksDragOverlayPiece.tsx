// src/components/discover/blocks/BlocksDragOverlayPiece.tsx
"use client";

import type { HandPiece, PieceColor } from "@/src/library/discover/blocksTypes";

interface BlocksDragOverlayPieceProps {
  piece: HandPiece;
  cellSize: number;
  gap: number;
}

const PIECE_COLOR_CLASSES: Record<PieceColor, string> = {
  blue: "bg-blue-400",
  green: "bg-emerald-400",
  amber: "bg-amber-400",
  rose: "bg-rose-400",
  violet: "bg-violet-400",
  teal: "bg-teal-400",
};

export default function BlocksDragOverlayPiece({ piece, cellSize, gap }: BlocksDragOverlayPieceProps) {
  const maxRow = Math.max(...piece.shape.cells.map(([r]) => r)) + 1;
  const maxCol = Math.max(...piece.shape.cells.map(([, c]) => c)) + 1;
  const filled = new Set(piece.shape.cells.map(([r, c]) => `${r}-${c}`));

  return (
    <div
      id="blocks-drag-overlay"
      style={{
        display: "grid",
        gap: `${gap}px`,
        gridTemplateColumns: `repeat(${maxCol}, ${cellSize}px)`,
        gridTemplateRows: `repeat(${maxRow}, ${cellSize}px)`,
      }}
    >
      {Array.from({ length: maxRow }, (_, row) =>
        Array.from({ length: maxCol }, (_, col) => (
          <div
            key={`${row}-${col}`}
            data-cell-row={row}
            data-cell-col={col}
            className={`rounded-sm ${filled.has(`${row}-${col}`) ? PIECE_COLOR_CLASSES[piece.color] : "opacity-0"}`}
            style={{ width: cellSize, height: cellSize }}
          />
        ))
      )}
    </div>
  );
}
