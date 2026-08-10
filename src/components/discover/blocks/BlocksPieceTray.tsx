// src/components/discover/blocks/BlocksPieceTray.tsx
"use client";

import { useLayoutEffect, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { measureBoardCellMetrics } from "@/src/library/discover/blocksLogic";
import type { HandPiece, PieceColor } from "@/src/library/discover/blocksTypes";

interface BlocksPieceTrayProps {
  hand: HandPiece[];
}

const PIECE_COLOR_CLASSES: Record<PieceColor, string> = {
  blue: "bg-blue-400",
  green: "bg-emerald-400",
  amber: "bg-amber-400",
  rose: "bg-rose-400",
  violet: "bg-violet-400",
  teal: "bg-teal-400",
};

// Matches the tray's pre-measurement size in the old fixed-2rem layout, so
// there's no visible jump once the real board metrics are measured.
const FALLBACK_CELL_METRICS = { size: 32, gap: 2 };

interface PieceGlyphProps {
  piece: HandPiece;
  cellSize: number;
  gap: number;
}

function PieceGlyph({ piece, cellSize, gap }: PieceGlyphProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `piece-${piece.instanceId}`,
    data: { piece },
  });

  const maxRow = Math.max(...piece.shape.cells.map(([r]) => r)) + 1;
  const maxCol = Math.max(...piece.shape.cells.map(([, c]) => c)) + 1;
  const filled = new Set(piece.shape.cells.map(([r, c]) => `${r}-${c}`));

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: isDragging ? undefined : CSS.Translate.toString(transform),
        gap: `${gap}px`,
        gridTemplateColumns: `repeat(${maxCol}, ${cellSize}px)`,
        gridTemplateRows: `repeat(${maxRow}, ${cellSize}px)`,
      }}
      className={`grid touch-none rounded-lg bg-bg-container shadow-sm ${
        isDragging ? "opacity-40" : "cursor-grab active:cursor-grabbing"
      }`}
    >
      {Array.from({ length: maxRow }, (_, row) =>
        Array.from({ length: maxCol }, (_, col) => (
          <div
            key={`${row}-${col}`}
            className={`rounded-sm ${filled.has(`${row}-${col}`) ? PIECE_COLOR_CLASSES[piece.color] : "opacity-0"}`}
            style={{ width: cellSize, height: cellSize }}
          />
        ))
      )}
    </div>
  );
}

export default function BlocksPieceTray({ hand }: BlocksPieceTrayProps) {
  const [cellMetrics, setCellMetrics] = useState(FALLBACK_CELL_METRICS);

  useLayoutEffect(() => {
    const measured = measureBoardCellMetrics();
    if (measured) setCellMetrics(measured);
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      {hand.map((piece) => (
        <PieceGlyph key={piece.instanceId} piece={piece} cellSize={cellMetrics.size} gap={cellMetrics.gap} />
      ))}
    </div>
  );
}
