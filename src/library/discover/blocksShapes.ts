// src/library/discover/blocksShapes.ts
import { HAND_SIZE, PIECE_COLORS, type HandPiece, type PieceColor, type PieceShape } from "./blocksTypes";

// Standard block-puzzle piece set (spec §4): singles, dominoes, trominoes,
// and all four tetromino families with their rotations pre-baked as
// separate catalog entries — pieces never rotate live in this game.
export const SHAPE_CATALOG: PieceShape[] = [
  { id: "single", cells: [[0, 0]] },

  { id: "domino-h", cells: [[0, 0], [0, 1]] },
  { id: "domino-v", cells: [[0, 0], [1, 0]] },

  { id: "tromino-line-h", cells: [[0, 0], [0, 1], [0, 2]] },
  { id: "tromino-line-v", cells: [[0, 0], [1, 0], [2, 0]] },
  { id: "tromino-l-1", cells: [[0, 0], [1, 0], [1, 1]] },
  { id: "tromino-l-2", cells: [[0, 0], [0, 1], [1, 0]] },
  { id: "tromino-l-3", cells: [[0, 0], [0, 1], [1, 1]] },
  { id: "tromino-l-4", cells: [[0, 1], [1, 0], [1, 1]] },

  { id: "tetromino-i-h", cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { id: "tetromino-i-v", cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { id: "tetromino-o", cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },

  { id: "tetromino-t-1", cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
  { id: "tetromino-t-2", cells: [[0, 1], [1, 0], [1, 1], [1, 2]] },
  { id: "tetromino-t-3", cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  { id: "tetromino-t-4", cells: [[0, 1], [1, 0], [1, 1], [2, 1]] },

  { id: "tetromino-s", cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
  { id: "tetromino-s-v", cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  { id: "tetromino-z", cells: [[0, 0], [0, 1], [1, 1], [1, 2]] },
  { id: "tetromino-z-v", cells: [[0, 1], [1, 0], [1, 1], [2, 0]] },

  { id: "tetromino-l-1", cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
  { id: "tetromino-l-2", cells: [[0, 0], [0, 1], [0, 2], [1, 0]] },
  { id: "tetromino-l-3", cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  { id: "tetromino-l-4", cells: [[1, 0], [1, 1], [1, 2], [0, 2]] },

  { id: "tetromino-j-1", cells: [[0, 1], [1, 1], [2, 0], [2, 1]] },
  { id: "tetromino-j-2", cells: [[0, 0], [1, 0], [1, 1], [1, 2]] },
  { id: "tetromino-j-3", cells: [[0, 0], [0, 1], [1, 0], [2, 0]] },
  { id: "tetromino-j-4", cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
];

let instanceCounter = 0;

/**
 * Draws `count` random pieces (with replacement) from the shape catalog.
 * `rng` is injectable for deterministic tests — must return a value in [0, 1).
 */
export function getRandomHand(count: number = HAND_SIZE, rng: () => number = Math.random): HandPiece[] {
  const hand: HandPiece[] = [];
  for (let i = 0; i < count; i += 1) {
    const shape = SHAPE_CATALOG[Math.floor(rng() * SHAPE_CATALOG.length)];
    const color: PieceColor = PIECE_COLORS[Math.floor(rng() * PIECE_COLORS.length)];
    instanceCounter += 1;
    hand.push({ instanceId: `piece-${Date.now()}-${instanceCounter}`, shape, color });
  }
  return hand;
}
