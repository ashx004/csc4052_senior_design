"use client";

import { useDroppable } from "@dnd-kit/core";
import type { Board, DragPreview, PieceColor } from "@/src/library/discover/blocksTypes";

interface BlocksBoardProps {
  board: Board;
  dragPreview: DragPreview | null;
}

/*
 * Written as complete Tailwind class names (not `bg-${color}-400`) because
 * Tailwind needs the full literal string to detect and generate the class —
 * same convention as MATCH_COLORS in MatchingQuestionGroup.tsx.
 */
const CELL_COLOR_CLASSES: Record<PieceColor, string> = {
  blue: "bg-blue-400",
  green: "bg-emerald-400",
  amber: "bg-amber-400",
  rose: "bg-rose-400",
  violet: "bg-violet-400",
  teal: "bg-teal-400",
};

function isCellInPreview(row: number, col: number, preview: DragPreview | null): boolean {
  if (!preview) return false;
  return preview.shape.cells.some(([dr, dc]) => preview.anchorRow + dr === row && preview.anchorCol + dc === col);
}

interface BoardCellViewProps {
  row: number;
  col: number;
  board: Board;
  dragPreview: DragPreview | null;
}

function BoardCellView({ row, col, board, dragPreview }: BoardCellViewProps) {
  const { setNodeRef } = useDroppable({ id: `cell-${row}-${col}`, data: { row, col } });
  const cell = board[row][col];
  const inPreview = isCellInPreview(row, col, dragPreview);

  let className = "aspect-square min-h-[3rem] min-w-[3rem] rounded-sm transition-colors";
  if (cell.filled) {
    className += ` border border-white/30 shadow-inner ${CELL_COLOR_CLASSES[cell.color as PieceColor]}`;
  } else if (inPreview) {
    className += dragPreview?.valid
      ? " border border-border-light bg-emerald-300/60 ring-2 ring-emerald-400"
      : " border border-border-light bg-red-300/60 ring-2 ring-red-400";
  } else {
    className += " border border-dashed border-border-light bg-bg-container";
  }

  return <div ref={setNodeRef} data-row={row} data-col={col} className={className} />;
}

export default function BlocksBoard({ board, dragPreview }: BlocksBoardProps) {
  return (
    <div
      className="grid gap-1 rounded-xl border border-border-light bg-bg-warm p-2"
      style={{ gridTemplateColumns: `repeat(${board.length}, minmax(0, 1fr))`, width: "min(100%, 560px)" }}
    >
      {board.map((rowCells, row) =>
        rowCells.map((_, col) => (
          <BoardCellView key={`${row}-${col}`} row={row} col={col} board={board} dragPreview={dragPreview} />
        ))
      )}
    </div>
  );
}
