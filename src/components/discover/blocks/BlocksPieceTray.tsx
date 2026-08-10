// src/components/discover/blocks/BlocksPieceTray.tsx
"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
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

function PieceGlyph({ piece }: { piece: HandPiece }) {
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
        transform: CSS.Translate.toString(transform),
        gridTemplateColumns: `repeat(${maxCol}, 2rem)`,
        gridTemplateRows: `repeat(${maxRow}, 2rem)`,
      }}
      className={`grid touch-none gap-0.5 rounded-lg border border-border-light bg-bg-container p-2 shadow-sm ${
        isDragging ? "opacity-40" : "cursor-grab active:cursor-grabbing"
      }`}
    >
      {Array.from({ length: maxRow }, (_, row) =>
        Array.from({ length: maxCol }, (_, col) => (
          <div
            key={`${row}-${col}`}
            className={`min-h-[2rem] min-w-[2rem] rounded-sm ${filled.has(`${row}-${col}`) ? PIECE_COLOR_CLASSES[piece.color] : "opacity-0"}`}
          />
        ))
      )}
    </div>
  );
}

export default function BlocksPieceTray({ hand }: BlocksPieceTrayProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      {hand.map((piece) => (
        <PieceGlyph key={piece.instanceId} piece={piece} />
      ))}
    </div>
  );
}
