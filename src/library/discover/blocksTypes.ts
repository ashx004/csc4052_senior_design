// src/library/discover/blocksTypes.ts

// --- Tunable constants (spec §2-7) ---
export const BOARD_SIZE = 8;
export const HAND_SIZE = 4;
export const MAX_HEARTS = 3;
export const POOL_TOPUP_THRESHOLD = 5;

// --- Piece colors (decorative only — spec §4) ---
export const PIECE_COLORS = ["blue", "green", "amber", "rose", "violet", "teal"] as const;
export type PieceColor = (typeof PIECE_COLORS)[number];

// --- Board & piece shapes ---
export interface BoardCell {
  filled: boolean;
  color: PieceColor | null;
}

export type Board = BoardCell[][];

export interface PieceShape {
  id: string;
  /** Relative [row, col] offsets from the shape's top-left bounding cell. */
  cells: [number, number][];
}

export interface HandPiece {
  instanceId: string;
  shape: PieceShape;
  color: PieceColor;
}

/** Live drag state, used by BlocksBoard to render a placement preview. */
export interface DragPreview {
  shape: PieceShape;
  anchorRow: number;
  anchorCol: number;
}

// --- Question pool (spec §3.1) ---
export interface BlocksSingleQuestion {
  id: string;
  kind: "single";
  type: "multiple_choice" | "true_false";
  question: string;
  options: string[];
  correctAnswer: string;
  sourceCourse: string;
  sourceSet: string;
  explanation?: string;
}

export interface BlocksMatchingPair {
  id: string;
  term: string;
  definition: string;
}

export interface BlocksMatchingQuestion {
  id: string;
  kind: "matching";
  sourceCourse: string;
  sourceSet: string;
  /** Always length >= 3 — smaller groups are filtered out before this type is constructed. */
  pairs: BlocksMatchingPair[];
}

export type BlocksQuestion = BlocksSingleQuestion | BlocksMatchingQuestion;

export function isSingleQuestion(question: BlocksQuestion): question is BlocksSingleQuestion {
  return question.kind === "single";
}

export function isMatchingQuestion(question: BlocksQuestion): question is BlocksMatchingQuestion {
  return question.kind === "matching";
}
