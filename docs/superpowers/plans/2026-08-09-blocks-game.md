# Blocks Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "Blocks" study game — an 8×8 block-placement puzzle on the Discover page, gated by multiple-choice/true-false/matching questions pulled from the player's own quizzes and flashcards.

**Architecture:** Pure, framework-free logic (types, piece shapes, board math, sound playback, the question pool builder) lives in `src/library/discover/` and `src/library/gameStats.ts`, fully unit-tested with Vitest. A thin React layer in `src/components/discover/blocks/` and a new route consume that logic — `BlocksGame` is the state-machine orchestrator; `BlocksBoard`/`BlocksPieceTray` handle drag-and-drop placement via `@dnd-kit/core`; `BlocksQuestionPanel` renders the question gate. No new test-runner infra is introduced for components (the repo has no React component-testing setup anywhere), so component tasks are verified via `tsc --noEmit`, `next lint`, and manual verification in the dev server, matching how every other component in this codebase is validated.

**Tech Stack:** Next.js (App Router) + React + TypeScript, Tailwind CSS, Firebase/Firestore, Vitest, new dependency `@dnd-kit/core` + `@dnd-kit/utilities`.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-08-09-blocks-game-design.md` — every task below implements a section of it; re-read the relevant section before starting a task.
- Board size: 8×8 (`BOARD_SIZE = 8`).
- Hand size: 4 pieces (`HAND_SIZE = 4`).
- Skip ("hearts") budget: 3 per game (`MAX_HEARTS = 3`).
- Pool top-up threshold: trigger AI top-up when fewer than 5 unserved questions remain (`POOL_TOPUP_THRESHOLD = 5`).
- Matching questions/groups require **at least 3 pairs** — smaller groups are dropped, never shown.
- No background music. Only three sound effects: `move`, `place`, `correct`. No sound on incorrect answers or skip.
- No new automated component-test framework — this repo has zero `.test.tsx` files and no `@testing-library/*` dependency; don't add one as a side effect of this feature. Pure logic in `src/library/**/*.ts` gets real Vitest unit tests (`npm run test`); UI components are verified with `npm run typecheck`, `npm run lint`, and manual dev-server checks (`npm run dev`).
- Firestore auth for API routes in this repo is cookie-based (`fb_token` cookie, checked by `verifyRequestAuth` in `src/library/verifyAuth.ts`) — client `fetch()` calls to internal API routes do **not** need a manual `Authorization` header, same-origin cookies are sent automatically.
- The existing AI question-generation route lives at `src/app/api/discover/learn-question/route.ts` (**singular** "learn-question"). Note: `src/library/discover/learnQuestions.ts:143` fetches `/api/discover/learn-questions` (**plural**) — a pre-existing 404 bug in that file, unrelated to this feature. Do **not** copy that mistake; the new pool builder must fetch `/api/discover/learn-question` (singular, the real path). Do not fix `learnQuestions.ts` itself — out of scope for this plan.
- Match existing design-token usage per area: quiz/matching components (`QuestionCard.tsx`, `AnswerOption.tsx`, `MatchingQuestionGroup.tsx`) use the semantic Tailwind theme tokens defined in `tailwind.config.ts` (`border-border-light`, `bg-bg-container`, `text-text-muted`, `bg-bg-warm`, etc.); the Discover page itself (`discover/page.tsx`) uses literal arbitrary-value hex classes (`bg-[#FAFAF8]`, `text-[#1a1a2e]`, `text-[#8B6914]`). Follow whichever convention the file you're editing already uses — don't force one style repo-wide.
- Run `npm run typecheck` and `npm run lint` before every commit in this plan; both must be clean.

---

### Task 1: Core types & constants (`blocksTypes.ts`)

**Files:**
- Create: `src/library/discover/blocksTypes.ts`
- Test: `src/library/discover/blocksTypes.test.ts`

**Interfaces:**
- Consumes: nothing (first file in the dependency graph).
- Produces: `BOARD_SIZE`, `HAND_SIZE`, `MAX_HEARTS`, `POOL_TOPUP_THRESHOLD` (numbers); `PIECE_COLORS` (readonly array), `PieceColor` (union type); `BoardCell`, `Board`, `PieceShape`, `HandPiece`, `DragPreview` (board/piece types); `BlocksSingleQuestion`, `BlocksMatchingQuestion`, `BlocksMatchingPair`, `BlocksQuestion` (question types); `isSingleQuestion(q)`, `isMatchingQuestion(q)` (type guards) — every later task imports from this file.

- [ ] **Step 1: Write the failing test for the type guards**

```ts
// src/library/discover/blocksTypes.test.ts
import { describe, expect, it } from "vitest";
import { isMatchingQuestion, isSingleQuestion, BOARD_SIZE, HAND_SIZE, MAX_HEARTS, POOL_TOPUP_THRESHOLD, PIECE_COLORS } from "./blocksTypes";
import type { BlocksQuestion } from "./blocksTypes";

const single: BlocksQuestion = {
  id: "q1",
  kind: "single",
  type: "multiple_choice",
  question: "What is 2+2?",
  options: ["3", "4", "5", "6"],
  correctAnswer: "4",
  sourceCourse: "CSC 101",
  sourceSet: "Arithmetic",
};

const matching: BlocksQuestion = {
  id: "q2",
  kind: "matching",
  sourceCourse: "CSC 101",
  sourceSet: "Vocabulary",
  pairs: [
    { id: "p1", term: "A", definition: "Apple" },
    { id: "p2", term: "B", definition: "Banana" },
    { id: "p3", term: "C", definition: "Cherry" },
  ],
};

describe("blocksTypes constants", () => {
  it("defines the board/hand/hearts/top-up sizes from the spec", () => {
    expect(BOARD_SIZE).toBe(8);
    expect(HAND_SIZE).toBe(4);
    expect(MAX_HEARTS).toBe(3);
    expect(POOL_TOPUP_THRESHOLD).toBe(5);
    expect(PIECE_COLORS.length).toBeGreaterThan(0);
  });
});

describe("isSingleQuestion", () => {
  it("returns true for a single question", () => {
    expect(isSingleQuestion(single)).toBe(true);
  });

  it("returns false for a matching question", () => {
    expect(isSingleQuestion(matching)).toBe(false);
  });
});

describe("isMatchingQuestion", () => {
  it("returns true for a matching question", () => {
    expect(isMatchingQuestion(matching)).toBe(true);
  });

  it("returns false for a single question", () => {
    expect(isMatchingQuestion(single)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- blocksTypes`
Expected: FAIL — `src/library/discover/blocksTypes.ts` doesn't exist yet (module not found).

- [ ] **Step 3: Write the implementation**

```ts
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

/** Live drag state, used by BlocksBoard to render a valid/invalid placement preview. */
export interface DragPreview {
  shape: PieceShape;
  anchorRow: number;
  anchorCol: number;
  valid: boolean;
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- blocksTypes`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/library/discover/blocksTypes.ts src/library/discover/blocksTypes.test.ts
git commit -m "feat(blocks): add core types and constants for the Blocks game"
```

---

### Task 2: Piece shape catalog (`blocksShapes.ts`)

**Files:**
- Create: `src/library/discover/blocksShapes.ts`
- Test: `src/library/discover/blocksShapes.test.ts`

**Interfaces:**
- Consumes: `PieceShape`, `HandPiece`, `PieceColor`, `PIECE_COLORS`, `HAND_SIZE` from `./blocksTypes` (Task 1).
- Produces: `SHAPE_CATALOG: PieceShape[]`, `getRandomHand(count: number, rng?: () => number): HandPiece[]` — consumed by `blocksLogic.ts` (Task 3) and `BlocksGame.tsx` (Task 10).

- [ ] **Step 1: Write the failing test**

```ts
// src/library/discover/blocksShapes.test.ts
import { describe, expect, it } from "vitest";
import { getRandomHand, SHAPE_CATALOG } from "./blocksShapes";
import { PIECE_COLORS } from "./blocksTypes";

describe("SHAPE_CATALOG", () => {
  it("contains only non-empty, in-bounds relative shapes", () => {
    expect(SHAPE_CATALOG.length).toBeGreaterThanOrEqual(20);
    for (const shape of SHAPE_CATALOG) {
      expect(shape.cells.length).toBeGreaterThan(0);
      expect(shape.cells.length).toBeLessThanOrEqual(5);
      for (const [row, col] of shape.cells) {
        expect(row).toBeGreaterThanOrEqual(0);
        expect(col).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("has unique ids", () => {
    const ids = SHAPE_CATALOG.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("getRandomHand", () => {
  it("returns HAND_SIZE pieces, each with a shape from the catalog and a valid color", () => {
    const hand = getRandomHand(4, () => 0);
    expect(hand).toHaveLength(4);
    for (const piece of hand) {
      expect(SHAPE_CATALOG).toContainEqual(piece.shape);
      expect(PIECE_COLORS).toContain(piece.color);
    }
  });

  it("is deterministic for a fixed rng", () => {
    const handA = getRandomHand(4, () => 0);
    const handB = getRandomHand(4, () => 0);
    expect(handA.map((p) => p.shape.id)).toEqual(handB.map((p) => p.shape.id));
    expect(handA.map((p) => p.color)).toEqual(handB.map((p) => p.color));
  });

  it("gives every piece a unique instanceId even with a fixed rng", () => {
    const hand = getRandomHand(4, () => 0);
    const ids = hand.map((p) => p.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("picks the last catalog entry and last color when rng returns just under 1", () => {
    const hand = getRandomHand(1, () => 0.9999999);
    expect(hand[0].shape).toEqual(SHAPE_CATALOG[SHAPE_CATALOG.length - 1]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- blocksShapes`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- blocksShapes`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/library/discover/blocksShapes.ts src/library/discover/blocksShapes.test.ts
git commit -m "feat(blocks): add piece shape catalog and random hand generator"
```

---

### Task 3: Board logic — placement, line clears, game-over check (`blocksLogic.ts`)

**Files:**
- Create: `src/library/discover/blocksLogic.ts`
- Test: `src/library/discover/blocksLogic.test.ts`

**Interfaces:**
- Consumes: `Board`, `BoardCell`, `PieceShape`, `HandPiece`, `PieceColor`, `BOARD_SIZE` from `./blocksTypes` (Task 1).
- Produces: `createEmptyBoard(size?)`, `canPlace(shape, anchorRow, anchorCol, board)`, `placeShape(shape, anchorRow, anchorCol, board, color)`, `getFullLines(board)`, `clearLines(board, rows, cols)`, `hasAnyValidPlacement(hand, board)` — all pure, all consumed by `BlocksGame.tsx` (Task 10).

This is the core rules engine — no Firestore, no React, no DOM. Every function takes a board in and returns a new board out (never mutates its input), so `BlocksGame` can hold `board` in `useState` and update it immutably.

- [ ] **Step 1: Write the failing tests for `createEmptyBoard` and `canPlace`**

```ts
// src/library/discover/blocksLogic.test.ts
import { describe, expect, it } from "vitest";
import { canPlace, clearLines, createEmptyBoard, getFullLines, hasAnyValidPlacement, placeShape } from "./blocksLogic";
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- blocksLogic`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `createEmptyBoard` and `canPlace`**

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- blocksLogic`
Expected: PASS (6 tests so far).

- [ ] **Step 5: Write the failing test for `placeShape`**

Add to `src/library/discover/blocksLogic.test.ts`:

```ts
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
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm run test -- blocksLogic`
Expected: FAIL — `placeShape` is not exported.

- [ ] **Step 7: Implement `placeShape`**

```ts
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
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm run test -- blocksLogic`
Expected: PASS (8 tests so far).

- [ ] **Step 9: Write the failing tests for `getFullLines` and `clearLines`**

Add to `src/library/discover/blocksLogic.test.ts`:

```ts
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
```

- [ ] **Step 10: Run the tests to verify they fail**

Run: `npm run test -- blocksLogic`
Expected: FAIL — `getFullLines`/`clearLines` not exported.

- [ ] **Step 11: Implement `getFullLines` and `clearLines`**

```ts
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
```

- [ ] **Step 12: Run the tests to verify they pass**

Run: `npm run test -- blocksLogic`
Expected: PASS (14 tests so far).

- [ ] **Step 13: Write the failing tests for `hasAnyValidPlacement`**

Add to `src/library/discover/blocksLogic.test.ts`:

```ts
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
```

- [ ] **Step 14: Run the tests to verify they fail**

Run: `npm run test -- blocksLogic`
Expected: FAIL — `hasAnyValidPlacement` not exported.

- [ ] **Step 15: Implement `hasAnyValidPlacement`**

```ts
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
```

- [ ] **Step 16: Run the full test file to verify everything passes**

Run: `npm run test -- blocksLogic`
Expected: PASS (18 tests).

- [ ] **Step 17: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 18: Commit**

```bash
git add src/library/discover/blocksLogic.ts src/library/discover/blocksLogic.test.ts
git commit -m "feat(blocks): add board placement, line-clear, and game-over logic"
```

---

### Task 4: Sound playback helper (`blocksSounds.ts`)

**Files:**
- Create: `src/library/discover/blocksSounds.ts`
- Test: `src/library/discover/blocksSounds.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `playMove()`, `playPlace()`, `playCorrect()` — called from `BlocksBoard.tsx`/`BlocksGame.tsx` (Tasks 7 & 10) on drag-start, successful drop, and correct-answer submit respectively.

The three audio files (`public/sounds/blocks/{move,place,correct}.mp3`) are provided by the project owner separately and are **not** part of this plan — this helper must not throw if they're missing (spec §6). `vitest.config.ts` runs tests in the `node` environment, so `window`/`Audio` are genuinely undefined by default there — that's exercised directly as the SSR-guard case, and the browser case is simulated with `vi.stubGlobal`.

- [ ] **Step 1: Write the failing test for the SSR no-op path**

```ts
// src/library/discover/blocksSounds.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("playSound (SSR / no window)", () => {
  it("does nothing and does not throw when window is unavailable", async () => {
    const { playMove } = await import("./blocksSounds");
    expect(() => playMove()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- blocksSounds`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/library/discover/blocksSounds.ts
export type BlocksSoundName = "move" | "place" | "correct";

const SOUND_FILES: Record<BlocksSoundName, string> = {
  move: "/sounds/blocks/move.mp3",
  place: "/sounds/blocks/place.mp3",
  correct: "/sounds/blocks/correct.mp3",
};

const audioCache = new Map<BlocksSoundName, HTMLAudioElement>();

/**
 * Plays a Blocks sound effect. No-ops silently (no throw) if:
 * - called during SSR (no `window`/`Audio`),
 * - the audio file 404s or fails to construct,
 * - the browser blocks playback (e.g. autoplay policy rejects the promise).
 * Each call clones the cached base element so rapid overlapping triggers
 * (move then place in quick succession) don't cut each other off.
 */
export function playSound(name: BlocksSoundName): void {
  if (typeof window === "undefined" || typeof Audio === "undefined") return;

  try {
    let base = audioCache.get(name);
    if (!base) {
      base = new Audio(SOUND_FILES[name]);
      audioCache.set(name, base);
    }
    const clone = base.cloneNode(true) as HTMLAudioElement;
    clone.play()?.catch(() => {
      // Autoplay restrictions or a missing/corrupt file — no-op.
    });
  } catch {
    // Audio unsupported or construction failed — no-op.
  }
}

export const playMove = () => playSound("move");
export const playPlace = () => playSound("place");
export const playCorrect = () => playSound("correct");
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- blocksSounds`
Expected: PASS (1 test).

- [ ] **Step 5: Write the failing tests for the browser-like path**

Add to `src/library/discover/blocksSounds.test.ts`:

```ts
describe("playSound (browser-like environment)", () => {
  function stubAudio() {
    const playSpy = vi.fn().mockResolvedValue(undefined);
    const constructedSrcs: string[] = [];

    class FakeAudioElement {
      src: string;
      constructor(src: string) {
        this.src = src;
        constructedSrcs.push(src);
      }
      cloneNode() {
        return { play: playSpy };
      }
    }

    vi.stubGlobal("window", {});
    vi.stubGlobal("Audio", FakeAudioElement);
    return { playSpy, constructedSrcs };
  }

  it("constructs the right file and plays a cloned node, not the cached base", async () => {
    const { playSpy, constructedSrcs } = stubAudio();
    const { playPlace } = await import("./blocksSounds");

    playPlace();

    expect(constructedSrcs).toEqual(["/sounds/blocks/place.mp3"]);
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("reuses the cached base Audio element across repeated calls (constructs only once)", async () => {
    const { constructedSrcs } = stubAudio();
    const { playCorrect } = await import("./blocksSounds");

    playCorrect();
    playCorrect();
    playCorrect();

    expect(constructedSrcs).toEqual(["/sounds/blocks/correct.mp3"]);
  });

  it("does not throw when play() rejects (e.g. autoplay blocked)", async () => {
    vi.stubGlobal("window", {});
    const rejectingPlay = vi.fn().mockRejectedValue(new Error("autoplay blocked"));
    class RejectingAudioElement {
      constructor(_src: string) {}
      cloneNode() {
        return { play: rejectingPlay };
      }
    }
    vi.stubGlobal("Audio", RejectingAudioElement);

    const { playMove } = await import("./blocksSounds");
    expect(() => playMove()).not.toThrow();
  });
});
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test -- blocksSounds`
Expected: PASS (4 tests total).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/library/discover/blocksSounds.ts src/library/discover/blocksSounds.test.ts
git commit -m "feat(blocks): add sound effect playback helper"
```

---

### Task 5: High score persistence (`src/library/gameStats.ts`)

**Files:**
- Create: `src/library/gameStats.ts`
- Test: `src/library/gameStats.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (standalone Firestore-facing module).
- Produces: `getBlocksHighScore(uid: string): Promise<number>`, `setBlocksHighScoreIfBeaten(uid: string, score: number): Promise<void>` — consumed by `blocks/page.tsx` (Task 12, reads on game start) and `BlocksGame.tsx` (Task 10, writes on game-over).

Follows the flat-field-on-`users/{uid}` convention already used for `learnerProfileMessageCount` in `src/library/studentProfile.ts` (read it first). Per repo convention (see `src/library/chatMemory.test.ts:1-8`), Firestore-touching async functions in this codebase are not unit-tested directly — instead, the pure decision logic is extracted into small functions (`parseHighScore`, `shouldUpdateHighScore`) and those get real tests. `./firebase` is mocked purely so the module can be imported without a live Firebase config (it calls `getAuth()` at import time).

- [ ] **Step 1: Write the failing tests for the pure helpers**

```ts
// src/library/gameStats.test.ts
import { describe, expect, it, vi } from "vitest";

// firebase.tsx calls getAuth() at import time, which throws without a real
// NEXT_PUBLIC_FIREBASE_API_KEY — mocked so this module can be imported.
// Matches the pattern in src/library/chatMemory.test.ts.
vi.mock("./firebase", () => ({ db: {} }));

const { parseHighScore, shouldUpdateHighScore } = await import("./gameStats");

describe("parseHighScore", () => {
  it("returns 0 when the doc data is null or not an object", () => {
    expect(parseHighScore(null)).toBe(0);
    expect(parseHighScore(undefined)).toBe(0);
    expect(parseHighScore("not an object")).toBe(0);
  });

  it("returns 0 when blocksHighScore is missing or the wrong type", () => {
    expect(parseHighScore({})).toBe(0);
    expect(parseHighScore({ blocksHighScore: "12" })).toBe(0);
    expect(parseHighScore({ blocksHighScore: null })).toBe(0);
  });

  it("returns 0 for a negative stored value (defensive)", () => {
    expect(parseHighScore({ blocksHighScore: -5 })).toBe(0);
  });

  it("returns the number when it's a valid non-negative finite number", () => {
    expect(parseHighScore({ blocksHighScore: 42 })).toBe(42);
    expect(parseHighScore({ blocksHighScore: 0 })).toBe(0);
  });
});

describe("shouldUpdateHighScore", () => {
  it("is true when the new score beats the current one", () => {
    expect(shouldUpdateHighScore(10, 11)).toBe(true);
  });

  it("is false when the new score ties or is below the current one", () => {
    expect(shouldUpdateHighScore(10, 10)).toBe(false);
    expect(shouldUpdateHighScore(10, 9)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- gameStats`
Expected: FAIL — `src/library/gameStats.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// src/library/gameStats.ts
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

/** Pure: extracts a valid high score from `users/{uid}` doc data, defaulting to 0. */
export function parseHighScore(data: unknown): number {
  if (!data || typeof data !== "object") return 0;
  const value = (data as Record<string, unknown>).blocksHighScore;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  return 0;
}

/** Pure: a new score only ever overwrites a strictly lower stored score. */
export function shouldUpdateHighScore(current: number, next: number): boolean {
  return next > current;
}

export async function getBlocksHighScore(uid: string): Promise<number> {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return 0;
    return parseHighScore(snap.data());
  } catch (error) {
    console.error("Error loading Blocks high score:", error);
    return 0;
  }
}

export async function setBlocksHighScoreIfBeaten(uid: string, score: number): Promise<void> {
  const current = await getBlocksHighScore(uid);
  if (!shouldUpdateHighScore(current, score)) return;

  try {
    await updateDoc(doc(db, "users", uid), { blocksHighScore: score });
  } catch (error) {
    console.error("Error saving Blocks high score:", error);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- gameStats`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/library/gameStats.ts src/library/gameStats.test.ts
git commit -m "feat(blocks): add persisted high score getter/setter"
```

---

### Task 6: Ground AI question generation in real flashcard content (extend the `learn-question` route)

**Files:**
- Modify: `src/app/api/discover/learn-question/route.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks — this is a standalone, backward-compatible route extension.
- Produces: an optional `cardsToTest` field on each course entry of the route's request body, consumed by `blocksPool.ts` (Task 7) when generating MC/TF questions from a flashcard set.

**Why this task exists:** the design spec (§3.2) says flashcard-sourced questions are auto-generated "via the AI route, same pattern as the existing fallback." The existing route (`src/app/api/discover/learn-question/route.ts`) only accepts `courseCode`/`courseName`/`existingTopics` — it has no way to tell the model "generate questions about *this specific flashcard content*." Its current prompt also frames `existingTopics` as things to **avoid** repeating (`"Avoid repeating topics that are already covered"` at line ~178), which is the opposite of what's needed here — we *want* the questions grounded in the flashcards' actual terms. This task adds one new optional field, purely additive: when absent (every existing Learn Questions call site), behavior is byte-for-byte unchanged.

- [ ] **Step 1: Read the current route**

Read `src/app/api/discover/learn-question/route.ts` in full (already read during planning — the two spots that change are the `RequestBodySchema` course-entry shape and the `courseDescriptions` prompt-building loop in the `POST` handler).

- [ ] **Step 2: Extend the request schema**

In `src/app/api/discover/learn-question/route.ts`, change:

```ts
const RequestBodySchema = z.object({
  courses: z.array(
    z.object({
      courseCode: z.string(),
      courseName: z.string(),
      existingTopics: z.array(z.string()).optional().default([]),
    })
  ).min(1),
  count: z.number().int().min(1).max(10),
});
```

to:

```ts
const RequestBodySchema = z.object({
  courses: z.array(
    z.object({
      courseCode: z.string(),
      courseName: z.string(),
      existingTopics: z.array(z.string()).optional().default([]),
      // Optional — when present, the model is told to base questions
      // specifically on this flashcard content instead of just the course
      // name/topics. Used by the Blocks game's flashcard-to-MC/TF pipeline;
      // absent (undefined) for every existing Learn Questions call site, so
      // this is a purely additive change.
      cardsToTest: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
    })
  ).min(1),
  count: z.number().int().min(1).max(10),
});
```

- [ ] **Step 3: Use it in the prompt-building loop**

Find the `courseDescriptions` construction in the `POST` handler:

```ts
const courseDescriptions = body.courses
  .map((c) => {
    const topics =
      c.existingTopics.length > 0
        ? `Topics already covered: ${c.existingTopics.join(", ")}.`
        : "";
    return `Course: ${c.courseCode} — ${c.courseName}. ${topics}`;
  })
  .join("\n");
```

Replace with:

```ts
const courseDescriptions = body.courses
  .map((c) => {
    const topics =
      c.existingTopics.length > 0
        ? `Topics already covered: ${c.existingTopics.join(", ")}.`
        : "";
    const cardsNote =
      c.cardsToTest && c.cardsToTest.length > 0
        ? ` Base the questions specifically on this flashcard content: ${c.cardsToTest
            .map((card) => `"${card.question}" → "${card.answer}"`)
            .join("; ")}.`
        : "";
    return `Course: ${c.courseCode} — ${c.courseName}. ${topics}${cardsNote}`;
  })
  .join("\n");
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Verify no regression to the existing Learn Questions call site**

Read `src/library/discover/learnQuestions.ts` and confirm its request body (built in `generateMissingQuestions`) never sets `cardsToTest` — so `courseDescriptions` for that call site renders identically to before this change. No code change needed there; this is a read-only confirmation step.

- [ ] **Step 7: Manual verification (deferred)**

This route requires a real `fb_token` session cookie, so it can't be meaningfully curled standalone without a logged-in browser session. Defer live verification to Task 7's manual playtest step, where `buildBlocksPool` calls this route with real `cardsToTest` data and the resulting questions can be checked for topical relevance to the sampled flashcards.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/discover/learn-question/route.ts
git commit -m "feat(blocks): let the learn-question route ground generation in real flashcard content"
```

---

### Task 7: Question pool builder (`blocksPool.ts`)

**Files:**
- Create: `src/library/discover/blocksPool.ts`
- Test: `src/library/discover/blocksPool.test.ts`

**Interfaces:**
- Consumes: `BlocksQuestion`, `BlocksSingleQuestion`, `BlocksMatchingQuestion`, `BlocksMatchingPair`, `POOL_TOPUP_THRESHOLD` from `./blocksTypes` (Task 1); `cardsToTest` support on `/api/discover/learn-question` (Task 6); `getEnrollmentStatus` from `@/src/library/enrollmentStatus` (existing).
- Produces: `buildBlocksPool(uid): Promise<BlocksQuestion[]>`, `topUpPool(pool, uid): Promise<BlocksQuestion[]>`, `pickNextQuestion(pool, servedIds, rng?): BlocksQuestion | null`, `needsTopUp(pool, servedIds, threshold?): boolean` — all four consumed by `BlocksGame.tsx` (Task 11). Also exports the pure helpers `extractSingleQuestions`, `extractMatchingQuestions`, `sampleFlashcardsAsMatching` for the unit tests below.

**Real Firestore shapes this task must match exactly** (confirmed by reading the source, not assumed):
- Quiz sets live at `users/{uid}/enrollment/{courseId}/quizSets/{setId}`, fields `name: string`, `questions: { id, type: "multiple_choice"|"true_false"|"matching", question, options, correctAnswer, matchingGroupId? }[]` — see `src/library/discover/learnQuestions.ts:71-91` and `src/components/quizzes/MatchingQuestionGroup.tsx` (a "matching" question's `question` field is the term, `correctAnswer` is its correct definition, and every question in the same `matchingGroupId` shares the same `options` array of all definitions in the group).
- Flashcard sets live at `users/{uid}/enrollment/{courseId}/flashcardSets/{setId}`, fields `name: string`, `cards: { question: string; answer: string }[]` (confirmed at `src/app/(course)/courses/[courseId]/flashcards/page.tsx:30-33,89-97` — **not** `front`/`back`, no per-card `id`).

Per repo convention, the Firestore/`fetch`-touching orchestration functions (`buildBlocksPool`, `topUpPool`) are not unit tested — `src/library/discover/learnQuestions.ts`, the closest existing analog, has no test file either. All the *decision logic* is pulled into small pure functions instead, and those get real tests.

- [ ] **Step 1: Write the failing tests for `extractSingleQuestions`**

```ts
// src/library/discover/blocksPool.test.ts
import { describe, expect, it, vi } from "vitest";

// blocksPool.ts imports @/src/library/firebase at module scope, which calls
// getAuth() at import time — mocked so this module can be imported without a
// live Firebase config. Matches src/library/chatMemory.test.ts.
vi.mock("@/src/library/firebase", () => ({ db: {} }));

const { extractSingleQuestions, extractMatchingQuestions, sampleFlashcardsAsMatching, needsTopUp, pickNextQuestion } =
  await import("./blocksPool");

describe("extractSingleQuestions", () => {
  it("maps multiple_choice and true_false questions, tagging source course/set", () => {
    const result = extractSingleQuestions(
      [
        { id: "q1", type: "multiple_choice", question: "2+2?", options: ["3", "4"], correctAnswer: "4" },
        { id: "q2", type: "true_false", question: "Sky is blue.", options: ["True", "False"], correctAnswer: "True" },
      ],
      "CSC 101 — Intro",
      "Chapter 1"
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      kind: "single",
      type: "multiple_choice",
      question: "2+2?",
      correctAnswer: "4",
      sourceCourse: "CSC 101 — Intro",
      sourceSet: "Chapter 1",
    });
  });

  it("skips matching questions and incomplete entries", () => {
    const result = extractSingleQuestions(
      [
        { id: "q1", type: "matching", question: "term", options: ["def"], correctAnswer: "def", matchingGroupId: "g1" },
        { id: "q2", type: "multiple_choice", question: "", options: ["a"], correctAnswer: "a" }, // no question text
        { id: "q3", type: "multiple_choice", question: "ok?", options: [], correctAnswer: "a" }, // no options
        { id: "q4", type: "multiple_choice", question: "ok?", options: ["a"], correctAnswer: "" }, // no correctAnswer
      ],
      "CSC 101",
      "Set"
    );
    expect(result).toHaveLength(0);
  });

  it("defaults explanation to an empty string when absent", () => {
    const [result] = extractSingleQuestions(
      [{ id: "q1", type: "true_false", question: "T?", options: ["True", "False"], correctAnswer: "True" }],
      "CSC 101",
      "Set"
    );
    expect(result.explanation).toBe("");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- blocksPool`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `extractSingleQuestions` and the raw-data types**

```ts
// src/library/discover/blocksPool.ts
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { getEnrollmentStatus } from "@/src/library/enrollmentStatus";
import { POOL_TOPUP_THRESHOLD } from "./blocksTypes";
import type {
  BlocksMatchingPair,
  BlocksMatchingQuestion,
  BlocksQuestion,
  BlocksSingleQuestion,
} from "./blocksTypes";

interface RawQuizQuestion {
  id?: string;
  type?: string;
  question?: string;
  options?: string[];
  correctAnswer?: string;
  explanation?: string;
  matchingGroupId?: string;
}

interface RawFlashcard {
  question: string;
  answer: string;
}

export function extractSingleQuestions(
  questions: RawQuizQuestion[],
  sourceCourse: string,
  sourceSet: string
): BlocksSingleQuestion[] {
  const result: BlocksSingleQuestion[] = [];
  questions.forEach((q, index) => {
    if (q.type !== "multiple_choice" && q.type !== "true_false") return;
    if (!q.question || !q.correctAnswer || !q.options?.length) return;
    result.push({
      id: `single-${sourceSet}-${q.id ?? index}`,
      kind: "single",
      type: q.type,
      question: q.question,
      options: q.options,
      correctAnswer: q.correctAnswer,
      sourceCourse,
      sourceSet,
      explanation: q.explanation || "",
    });
  });
  return result;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- blocksPool`
Expected: PASS (3 tests so far).

- [ ] **Step 5: Write the failing tests for `extractMatchingQuestions`**

Add to `src/library/discover/blocksPool.test.ts`:

```ts
describe("extractMatchingQuestions", () => {
  const threeGroup: any[] = [
    { id: "a1", type: "matching", question: "Term A", options: ["Def A", "Def B", "Def C"], correctAnswer: "Def A", matchingGroupId: "g1" },
    { id: "a2", type: "matching", question: "Term B", options: ["Def A", "Def B", "Def C"], correctAnswer: "Def B", matchingGroupId: "g1" },
    { id: "a3", type: "matching", question: "Term C", options: ["Def A", "Def B", "Def C"], correctAnswer: "Def C", matchingGroupId: "g1" },
  ];

  it("groups matching questions by matchingGroupId into one BlocksMatchingQuestion when the group has >= 3 pairs", () => {
    const result = extractMatchingQuestions(threeGroup, "CSC 101", "Vocab Set");
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("matching");
    expect(result[0].pairs).toEqual([
      { id: "a1", term: "Term A", definition: "Def A" },
      { id: "a2", term: "Term B", definition: "Def B" },
      { id: "a3", term: "Term C", definition: "Def C" },
    ]);
  });

  it("drops groups smaller than 3 pairs", () => {
    const twoOnly = threeGroup.slice(0, 2);
    expect(extractMatchingQuestions(twoOnly, "CSC 101", "Vocab Set")).toHaveLength(0);
  });

  it("ignores non-matching questions and matching questions without a matchingGroupId", () => {
    const mixed = [
      ...threeGroup,
      { id: "b1", type: "multiple_choice", question: "Q", options: ["A"], correctAnswer: "A" },
      { id: "b2", type: "matching", question: "Orphan", options: ["X"], correctAnswer: "X" },
    ];
    const result = extractMatchingQuestions(mixed, "CSC 101", "Vocab Set");
    expect(result).toHaveLength(1); // still just the g1 group
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npm run test -- blocksPool`
Expected: FAIL — `extractMatchingQuestions` not exported.

- [ ] **Step 7: Implement `extractMatchingQuestions`**

```ts
export function extractMatchingQuestions(
  questions: RawQuizQuestion[],
  sourceCourse: string,
  sourceSet: string
): BlocksMatchingQuestion[] {
  const groups = new Map<string, RawQuizQuestion[]>();
  for (const q of questions) {
    if (q.type !== "matching" || !q.matchingGroupId) continue;
    if (!q.question || !q.correctAnswer) continue;
    const group = groups.get(q.matchingGroupId) ?? [];
    group.push(q);
    groups.set(q.matchingGroupId, group);
  }

  const result: BlocksMatchingQuestion[] = [];
  for (const [groupId, group] of groups) {
    if (group.length < 3) continue;
    const pairs: BlocksMatchingPair[] = group.map((q, index) => ({
      id: q.id ?? `${groupId}-${index}`,
      term: q.question as string,
      definition: q.correctAnswer as string,
    }));
    result.push({ id: `matching-${sourceSet}-${groupId}`, kind: "matching", sourceCourse, sourceSet, pairs });
  }
  return result;
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm run test -- blocksPool`
Expected: PASS (6 tests so far).

- [ ] **Step 9: Write the failing tests for `sampleFlashcardsAsMatching`**

Add to `src/library/discover/blocksPool.test.ts`:

```ts
describe("sampleFlashcardsAsMatching", () => {
  const sixCards: RawFlashcardTestShape[] = Array.from({ length: 6 }, (_, i) => ({
    question: `Term ${i}`,
    answer: `Definition ${i}`,
  }));

  it("returns null when there are fewer than 3 cards", () => {
    expect(sampleFlashcardsAsMatching([{ question: "A", answer: "1" }], "CSC 101", "Set")).toBeNull();
  });

  it("returns a matching question with between 3 and 5 pairs for a deterministic rng", () => {
    const result = sampleFlashcardsAsMatching(sixCards, "CSC 101", "Set", () => 0);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("matching");
    expect(result!.pairs.length).toBeGreaterThanOrEqual(3);
    expect(result!.pairs.length).toBeLessThanOrEqual(5);
  });

  it("maps card.question to term and card.answer to definition", () => {
    const result = sampleFlashcardsAsMatching(sixCards, "CSC 101", "Set", () => 0)!;
    for (const pair of result.pairs) {
      expect(pair.term).toMatch(/^Term \d$/);
      expect(pair.definition).toMatch(/^Definition \d$/);
    }
  });

  it("caps the sample at 5 pairs even with many cards", () => {
    const twenty = Array.from({ length: 20 }, (_, i) => ({ question: `T${i}`, answer: `D${i}` }));
    const result = sampleFlashcardsAsMatching(twenty, "CSC 101", "Set", () => 0.999)!;
    expect(result.pairs.length).toBeLessThanOrEqual(5);
  });
});
```

Add the `RawFlashcardTestShape` type alias at the top of the test file (next to the imports) so the test compiles standalone:

```ts
interface RawFlashcardTestShape {
  question: string;
  answer: string;
}
```

- [ ] **Step 10: Run the tests to verify they fail**

Run: `npm run test -- blocksPool`
Expected: FAIL — `sampleFlashcardsAsMatching` not exported.

- [ ] **Step 11: Implement `sampleFlashcardsAsMatching`**

```ts
export function sampleFlashcardsAsMatching(
  cards: RawFlashcard[],
  sourceCourse: string,
  sourceSet: string,
  rng: () => number = Math.random
): BlocksMatchingQuestion | null {
  if (cards.length < 3) return null;

  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const maxSample = Math.min(5, shuffled.length);
  const minSample = Math.min(3, maxSample);
  const count = minSample + Math.floor(rng() * (maxSample - minSample + 1));
  const sample = shuffled.slice(0, count);

  const pairs: BlocksMatchingPair[] = sample.map((card, index) => ({
    id: `${sourceSet}-flashcard-${index}`,
    term: card.question,
    definition: card.answer,
  }));

  return { id: `matching-flashcards-${sourceSet}`, kind: "matching", sourceCourse, sourceSet, pairs };
}
```

- [ ] **Step 12: Run the tests to verify they pass**

Run: `npm run test -- blocksPool`
Expected: PASS (10 tests so far).

- [ ] **Step 13: Write the failing tests for `needsTopUp` and `pickNextQuestion`**

Add to `src/library/discover/blocksPool.test.ts`:

Add this import to the top of the test file, alongside the existing imports:

```ts
import type { BlocksSingleQuestion } from "./blocksTypes";
```

```ts
function makeQuestion(id: string): BlocksSingleQuestion {
  return {
    id,
    kind: "single",
    type: "multiple_choice",
    question: id,
    options: ["a", "b"],
    correctAnswer: "a",
    sourceCourse: "CSC 101",
    sourceSet: "Set",
  };
}

describe("needsTopUp", () => {
  it("is true when fewer than the threshold are unserved", () => {
    const pool = [makeQuestion("q1"), makeQuestion("q2")];
    expect(needsTopUp(pool, new Set(), 5)).toBe(true);
  });

  it("is false when at least the threshold are unserved", () => {
    const pool = Array.from({ length: 5 }, (_, i) => makeQuestion(`q${i}`));
    expect(needsTopUp(pool, new Set(), 5)).toBe(false);
  });

  it("counts served questions as not available", () => {
    const pool = Array.from({ length: 5 }, (_, i) => makeQuestion(`q${i}`));
    expect(needsTopUp(pool, new Set(["q0", "q1"]), 5)).toBe(true); // only 3 unserved left
  });
});

describe("pickNextQuestion", () => {
  it("returns null when the pool is empty or fully served", () => {
    expect(pickNextQuestion([], new Set())).toBeNull();
    const pool = [makeQuestion("q1")];
    expect(pickNextQuestion(pool, new Set(["q1"]))).toBeNull();
  });

  it("returns an unserved question, never a served one", () => {
    const pool = [makeQuestion("q1"), makeQuestion("q2")];
    const picked = pickNextQuestion(pool, new Set(["q1"]), () => 0);
    expect(picked?.id).toBe("q2");
  });
});
```

- [ ] **Step 14: Run the tests to verify they fail**

Run: `npm run test -- blocksPool`
Expected: FAIL — `needsTopUp`/`pickNextQuestion` not exported.

- [ ] **Step 15: Implement `needsTopUp` and `pickNextQuestion`**

```ts
export function needsTopUp(
  pool: BlocksQuestion[],
  servedIds: Set<string>,
  threshold: number = POOL_TOPUP_THRESHOLD
): boolean {
  const unserved = pool.filter((q) => !servedIds.has(q.id)).length;
  return unserved < threshold;
}

export function pickNextQuestion(
  pool: BlocksQuestion[],
  servedIds: Set<string>,
  rng: () => number = Math.random
): BlocksQuestion | null {
  const unserved = pool.filter((q) => !servedIds.has(q.id));
  if (unserved.length === 0) return null;
  return unserved[Math.floor(rng() * unserved.length)];
}
```

- [ ] **Step 16: Run the full test file to verify everything passes**

Run: `npm run test -- blocksPool`
Expected: PASS (15 tests).

- [ ] **Step 17: Implement the Firestore/AI orchestration functions (not unit tested — see rationale above)**

Append to `src/library/discover/blocksPool.ts`:

```ts
interface ActiveCourse {
  courseId: string;
  classCode: string;
  className: string;
}

async function getActiveCourses(uid: string): Promise<ActiveCourse[]> {
  const enrollSnap = await getDocs(collection(db, "users", uid, "enrollment"));
  const courses: ActiveCourse[] = [];
  enrollSnap.forEach((docSnap) => {
    const data = docSnap.data();
    const status = getEnrollmentStatus(data);
    if (status === "in-progress" || status === "planned") {
      courses.push({
        courseId: docSnap.id,
        classCode: data.classCode || "",
        className: data.className || data.classCode || "Unknown Course",
      });
    }
  });
  return courses;
}

async function generateAIQuestions(
  courses: ActiveCourse[],
  count: number,
  cardsByCourse?: Map<string, RawFlashcard[]>
): Promise<BlocksSingleQuestion[]> {
  const body = {
    courses: courses.map((c) => ({
      courseCode: c.classCode,
      courseName: c.className,
      existingTopics: [] as string[],
      cardsToTest: cardsByCourse?.get(c.courseId),
    })),
    count,
  };

  const res = await fetch("/api/discover/learn-question", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`AI question generation returned ${res.status}`);

  const data = await res.json();
  const questions: { id?: string; type: "multiple_choice" | "true_false"; question: string; options: string[]; correctAnswer: string; explanation?: string }[] =
    data.questions || [];

  return questions.map((q, i) => ({
    id: `gen-${Date.now()}-${i}`,
    kind: "single" as const,
    type: q.type,
    question: q.question,
    options: q.options,
    correctAnswer: q.correctAnswer,
    sourceCourse: "AI Generated",
    sourceSet: "Blocks",
    explanation: q.explanation || "",
  }));
}

/** Builds the initial cross-course question pool for a Blocks game (spec §3). */
export async function buildBlocksPool(uid: string): Promise<BlocksQuestion[]> {
  const activeCourses = await getActiveCourses(uid);
  if (activeCourses.length === 0) return [];

  const pool: BlocksQuestion[] = [];

  for (const course of activeCourses) {
    const sourceCourse = `${course.classCode} — ${course.className}`;

    const quizSnap = await getDocs(collection(db, "users", uid, "enrollment", course.courseId, "quizSets"));
    quizSnap.forEach((qDoc) => {
      const set = qDoc.data();
      const setName = set.name || "Untitled";
      const questions: RawQuizQuestion[] = set.questions || [];
      pool.push(...extractSingleQuestions(questions, sourceCourse, setName));
      pool.push(...extractMatchingQuestions(questions, sourceCourse, setName));
    });

    const flashcardSnap = await getDocs(
      collection(db, "users", uid, "enrollment", course.courseId, "flashcardSets")
    );
    for (const fDoc of flashcardSnap.docs) {
      const set = fDoc.data();
      const setName = set.name || "Untitled";
      const cards: RawFlashcard[] = set.cards || [];
      if (cards.length < 3) continue;

      const matching = sampleFlashcardsAsMatching(cards, sourceCourse, setName);
      if (matching) pool.push(matching);

      try {
        const generated = await generateAIQuestions([course], 3, new Map([[course.courseId, cards.slice(0, 10)]]));
        pool.push(...generated.map((q) => ({ ...q, sourceCourse, sourceSet: setName })));
      } catch (err) {
        console.error(`Blocks: flashcard question generation failed for "${setName}":`, err);
      }
    }
  }

  return pool;
}

/** Tops up a running pool when it's getting low on unserved questions (spec §3.3). */
export async function topUpPool(pool: BlocksQuestion[], uid: string): Promise<BlocksQuestion[]> {
  try {
    const activeCourses = await getActiveCourses(uid);
    if (activeCourses.length === 0) return pool;

    const generated = await generateAIQuestions(activeCourses, 5);
    const existingIds = new Set(pool.map((q) => q.id));
    const fresh = generated.filter((q) => !existingIds.has(q.id));
    return [...pool, ...fresh];
  } catch (err) {
    console.error("Blocks: pool top-up failed, continuing with the existing pool:", err);
    return pool;
  }
}
```

- [ ] **Step 18: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 19: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 20: Commit**

```bash
git add src/library/discover/blocksPool.ts src/library/discover/blocksPool.test.ts
git commit -m "feat(blocks): add cross-course question pool builder with AI top-up"
```

---

### Task 8: Drag-and-drop dependency + board rendering (`BlocksBoard.tsx`)

**Files:**
- Modify: `package.json` (add `@dnd-kit/core`, `@dnd-kit/utilities`)
- Create: `src/components/discover/blocks/BlocksBoard.tsx`

**Interfaces:**
- Consumes: `Board`, `DragPreview`, `PieceColor` from `@/src/library/discover/blocksTypes` (Task 1).
- Produces: `<BlocksBoard board={board} dragPreview={dragPreview} />` — a droppable 8×8 grid, one `useDroppable` zone per cell with id `cell-{row}-{col}`. Consumed by `BlocksGame.tsx` (Task 11), which owns the `DndContext` and `dragPreview` state.

No test file — this repo has no component-testing setup (see Global Constraints). Verified via `tsc --noEmit`, `next lint`, and (once wired into the route in Task 13) manual dev-server verification.

- [ ] **Step 1: Install the drag-and-drop dependency**

Run: `npm install @dnd-kit/core @dnd-kit/utilities`

This is the only new runtime dependency this feature needs — the repo has no existing DnD library (confirmed by grepping `package.json` during planning).

- [ ] **Step 2: Verify the install**

Run: `npm run typecheck`
Expected: no errors, and no peer-dependency conflict warnings printed during install (dnd-kit v6 supports React 16.8–19; this repo is on React 19.2.7 — if `npm install` prints an `ERESOLVE` warning, report it before continuing rather than forcing with `--legacy-peer-deps`).

- [ ] **Step 3: Write `BlocksBoard.tsx`**

```tsx
// src/components/discover/blocks/BlocksBoard.tsx
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

  let className = "aspect-square rounded-sm border border-border-light transition-colors";
  if (cell.filled) {
    className += ` ${CELL_COLOR_CLASSES[cell.color as PieceColor]}`;
  } else if (inPreview) {
    className += dragPreview?.valid ? " bg-emerald-200" : " bg-red-200";
  } else {
    className += " bg-bg-container";
  }

  return <div ref={setNodeRef} data-row={row} data-col={col} className={className} />;
}

export default function BlocksBoard({ board, dragPreview }: BlocksBoardProps) {
  return (
    <div
      className="grid gap-1 rounded-xl border border-border-light bg-bg-warm p-2"
      style={{ gridTemplateColumns: `repeat(${board.length}, minmax(0, 1fr))`, width: "min(100%, 400px)" }}
    >
      {board.map((rowCells, row) =>
        rowCells.map((_, col) => (
          <BoardCellView key={`${row}-${col}`} row={row} col={col} board={board} dragPreview={dragPreview} />
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/components/discover/blocks/BlocksBoard.tsx
git commit -m "feat(blocks): add BlocksBoard grid with dnd-kit droppable cells"
```

---

### Task 9: Piece tray (`BlocksPieceTray.tsx`)

**Files:**
- Create: `src/components/discover/blocks/BlocksPieceTray.tsx`

**Interfaces:**
- Consumes: `HandPiece`, `PieceColor` from `@/src/library/discover/blocksTypes` (Task 1); `@dnd-kit/core`'s `useDraggable` (installed in Task 8).
- Produces: `<BlocksPieceTray hand={hand} />` — renders up to 4 draggable pieces, one `useDraggable` per piece with id `piece-{instanceId}`. Consumed by `BlocksGame.tsx` (Task 11).

No test file (see Global Constraints). Verified via `tsc --noEmit`, `next lint`, and manual dev-server verification once wired in Task 13.

- [ ] **Step 1: Write `BlocksPieceTray.tsx`**

```tsx
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
        gridTemplateColumns: `repeat(${maxCol}, 1.25rem)`,
        gridTemplateRows: `repeat(${maxRow}, 1.25rem)`,
      }}
      className={`grid touch-none gap-0.5 rounded-lg border border-border-light bg-bg-container p-2 shadow-sm ${
        isDragging ? "opacity-40" : "cursor-grab active:cursor-grabbing"
      }`}
    >
      {Array.from({ length: maxRow }, (_, row) =>
        Array.from({ length: maxCol }, (_, col) => (
          <div
            key={`${row}-${col}`}
            className={`rounded-sm ${filled.has(`${row}-${col}`) ? PIECE_COLOR_CLASSES[piece.color] : "opacity-0"}`}
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/discover/blocks/BlocksPieceTray.tsx
git commit -m "feat(blocks): add draggable piece tray"
```

---

### Task 10: Question gate panel (`BlocksQuestionPanel.tsx`)

**Files:**
- Create: `src/components/discover/blocks/BlocksQuestionPanel.tsx`

**Interfaces:**
- Consumes: `BlocksQuestion`, `isSingleQuestion`, `isMatchingQuestion`, `MAX_HEARTS` from `@/src/library/discover/blocksTypes` (Task 1); reuses `AnswerOption` (`@/src/components/quizzes/AnswerOption`) and `MatchingQuestionGroup` (`@/src/components/quizzes/MatchingQuestionGroup`) as-is, no changes to either.
- Produces: `<BlocksQuestionPanel question={question} heartsRemaining={heartsRemaining} onCorrect={fn} onSkip={fn} />` — consumed by `BlocksGame.tsx` (Task 11). `onCorrect` fires only on a correct Submit; `onSkip` fires on the Skip button regardless of question state.

Reuses `AnswerOption` directly for MC/TF (identical taking/results visual treatment as the existing quiz flow) and reuses `MatchingQuestionGroup` directly for matching by reshaping `BlocksMatchingQuestion.pairs` into the `{id, question, correctAnswer, options}[]` shape it already expects (`definitions = questions[0]?.options`, so every pair's `options` is the full shared list of definitions) — no new matching-interaction code needed. No test file (see Global Constraints).

- [ ] **Step 1: Write `BlocksQuestionPanel.tsx`**

```tsx
// src/components/discover/blocks/BlocksQuestionPanel.tsx
"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import AnswerOption from "@/src/components/quizzes/AnswerOption";
import MatchingQuestionGroup from "@/src/components/quizzes/MatchingQuestionGroup";
import { isMatchingQuestion, isSingleQuestion, MAX_HEARTS } from "@/src/library/discover/blocksTypes";
import type { BlocksQuestion } from "@/src/library/discover/blocksTypes";

interface BlocksQuestionPanelProps {
  question: BlocksQuestion;
  heartsRemaining: number;
  onCorrect: () => void;
  onSkip: () => void;
}

export default function BlocksQuestionPanel({ question, heartsRemaining, onCorrect, onSkip }: BlocksQuestionPanelProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [matchAnswers, setMatchAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  // A new question (after a skip, or the next round's question) always
  // starts fresh. Retrying the SAME wrong question does not reset this —
  // handleTryAgain flips `submitted` back to false without clearing answers,
  // so the player only has to fix what was wrong.
  useEffect(() => {
    setSelected(null);
    setMatchAnswers({});
    setSubmitted(false);
  }, [question.id]);

  const canSubmit = isSingleQuestion(question)
    ? selected !== null
    : isMatchingQuestion(question) && question.pairs.every((pair) => matchAnswers[pair.id]);

  const handleSubmit = () => {
    if (!canSubmit) return;

    const isCorrect = isSingleQuestion(question)
      ? selected === question.correctAnswer
      : isMatchingQuestion(question) && question.pairs.every((pair) => matchAnswers[pair.id] === pair.definition);

    if (isCorrect) {
      onCorrect();
      return;
    }
    setSubmitted(true);
  };

  const mode = submitted ? "results" : "taking";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border-light bg-bg-container p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          {question.sourceCourse} · {question.sourceSet}
        </p>
        <div className="flex items-center gap-1" aria-label={`${heartsRemaining} skips remaining`}>
          {Array.from({ length: MAX_HEARTS }, (_, i) => (
            <Heart key={i} size={14} className={i < heartsRemaining ? "fill-rose-400 text-rose-400" : "text-border-light"} />
          ))}
        </div>
      </div>

      {isSingleQuestion(question) && (
        <>
          <h3 className="text-base font-bold text-text-main">{question.question}</h3>
          <div className="grid grid-cols-1 gap-2">
            {question.options.map((option) => (
              <AnswerOption
                key={option}
                option={option}
                isSelected={selected === option}
                isCorrect={option === question.correctAnswer}
                isUserAnswer={selected === option}
                mode={mode}
                onClick={() => !submitted && setSelected(option)}
              />
            ))}
          </div>
        </>
      )}

      {isMatchingQuestion(question) && (
        <MatchingQuestionGroup
          questions={question.pairs.map((pair) => ({
            id: pair.id,
            question: pair.term,
            correctAnswer: pair.definition,
            options: question.pairs.map((p) => p.definition),
          }))}
          answers={matchAnswers}
          onSelect={(id, answer) => setMatchAnswers((prev) => ({ ...prev, [id]: answer }))}
          mode={mode}
        />
      )}

      {submitted && (
        <p className="text-xs font-medium text-red-500">Not quite — check the highlighted answer(s) and try again.</p>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSkip}
          disabled={heartsRemaining <= 0}
          className="rounded-lg border border-border-light px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-bg-warm disabled:cursor-not-allowed disabled:opacity-40"
        >
          Skip question
        </button>

        {submitted ? (
          <button
            type="button"
            onClick={() => setSubmitted(false)}
            className="rounded-lg bg-[#1a1a2e] px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#2a2a3e]"
          >
            Try Again
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-lg bg-[#1a1a2e] px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#2a2a3e] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Submit
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/discover/blocks/BlocksQuestionPanel.tsx
git commit -m "feat(blocks): add question gate panel for MC/TF and matching"
```

---

### Task 11: Game orchestrator (`BlocksGame.tsx`)

**Files:**
- Create: `src/components/discover/blocks/BlocksGame.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–10 — `blocksTypes.ts` (types/constants), `blocksShapes.ts` (`getRandomHand`), `blocksLogic.ts` (`createEmptyBoard`, `canPlace`, `placeShape`, `getFullLines`, `clearLines`, `hasAnyValidPlacement`), `blocksSounds.ts` (`playMove`, `playPlace`, `playCorrect`), `gameStats.ts` (`getBlocksHighScore`, `setBlocksHighScoreIfBeaten`), `blocksPool.ts` (`buildBlocksPool`, `topUpPool`, `needsTopUp`, `pickNextQuestion`), `BlocksBoard`, `BlocksPieceTray`, `BlocksQuestionPanel`.
- Produces: `<BlocksGame uid={uid} onGameOver={(finalScore, highScore) => void} />` — consumed by `blocks/page.tsx` (Task 13). `onGameOver` fires exactly once, after the high score has been persisted, so the page can switch to the `gameover` view with both numbers in hand.

This is the state machine wiring the whole game loop together (spec §5). No test file (see Global Constraints) — verified via `tsc --noEmit`, `next lint`, and a full manual playthrough once Task 13 wires it into a route.

- [ ] **Step 1: Write `BlocksGame.tsx`**

```tsx
// src/components/discover/blocks/BlocksGame.tsx
"use client";

import { useEffect, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragOverEvent } from "@dnd-kit/core";
import { Loader2, Trophy } from "lucide-react";
import {
  canPlace,
  clearLines,
  createEmptyBoard,
  getFullLines,
  hasAnyValidPlacement,
  placeShape,
} from "@/src/library/discover/blocksLogic";
import { getRandomHand } from "@/src/library/discover/blocksShapes";
import { playCorrect, playMove, playPlace } from "@/src/library/discover/blocksSounds";
import { buildBlocksPool, needsTopUp, pickNextQuestion, topUpPool } from "@/src/library/discover/blocksPool";
import { getBlocksHighScore, setBlocksHighScoreIfBeaten } from "@/src/library/gameStats";
import { HAND_SIZE, MAX_HEARTS, type Board, type BlocksQuestion, type DragPreview, type HandPiece } from "@/src/library/discover/blocksTypes";
import BlocksBoard from "./BlocksBoard";
import BlocksPieceTray from "./BlocksPieceTray";
import BlocksQuestionPanel from "./BlocksQuestionPanel";

interface BlocksGameProps {
  uid: string;
  onGameOver: (finalScore: number, highScore: number) => void;
}

type Phase = "loading" | "placing" | "answering" | "ending";

interface CellDropData {
  row: number;
  col: number;
}

export default function BlocksGame({ uid, onGameOver }: BlocksGameProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [board, setBoard] = useState<Board>(() => createEmptyBoard());
  const [hand, setHand] = useState<HandPiece[]>([]);
  const [score, setScore] = useState(0);
  const [storedHighScore, setStoredHighScore] = useState(0);
  const [heartsRemaining, setHeartsRemaining] = useState(MAX_HEARTS);
  const [pool, setPool] = useState<BlocksQuestion[]>([]);
  const [servedIds, setServedIds] = useState<Set<string>>(new Set());
  const [currentQuestion, setCurrentQuestion] = useState<BlocksQuestion | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [builtPool, existingHighScore] = await Promise.all([buildBlocksPool(uid), getBlocksHighScore(uid)]);
      if (cancelled) return;
      setPool(builtPool);
      setStoredHighScore(existingHighScore);
      setHand(getRandomHand(HAND_SIZE));
      setBoard(createEmptyBoard());
      setPhase("placing");
    })();

    return () => {
      cancelled = true;
    };
  }, [uid]);

  const maybeTopUp = (currentPool: BlocksQuestion[], currentServed: Set<string>) => {
    if (!needsTopUp(currentPool, currentServed)) return;
    topUpPool(currentPool, uid).then((updated) => setPool(updated));
  };

  const endGame = async (finalScore: number) => {
    setPhase("ending");
    await setBlocksHighScoreIfBeaten(uid, finalScore);
    onGameOver(finalScore, Math.max(finalScore, storedHighScore));
  };

  const startAnsweringPhase = (currentPool: BlocksQuestion[], currentServed: Set<string>) => {
    if (currentPool.length === 0) {
      // No questions were ever available (e.g. a brand-new account with no
      // quizzes/flashcards yet) — skip the gate rather than block the game.
      setHand(getRandomHand(HAND_SIZE));
      setPhase("placing");
      return;
    }

    let next = pickNextQuestion(currentPool, currentServed);
    let servedForNext = currentServed;
    if (!next) {
      // Every question in the pool has been served this game — allow repeats
      // rather than getting stuck (spec §3.3 fallback).
      servedForNext = new Set();
      setServedIds(servedForNext);
      next = pickNextQuestion(currentPool, servedForNext);
    }
    setCurrentQuestion(next);
    setPhase("answering");
    maybeTopUp(currentPool, servedForNext);
  };

  const handleDragStart = () => {
    playMove();
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) {
      setDragPreview(null);
      return;
    }
    const piece = hand.find((p) => `piece-${p.instanceId}` === active.id);
    const cellData = over.data.current as CellDropData | undefined;
    if (!piece || !cellData) {
      setDragPreview(null);
      return;
    }
    setDragPreview({
      shape: piece.shape,
      anchorRow: cellData.row,
      anchorCol: cellData.col,
      valid: canPlace(piece.shape, cellData.row, cellData.col, board),
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragPreview(null);
    const { active, over } = event;
    if (!over) return;

    const piece = hand.find((p) => `piece-${p.instanceId}` === active.id);
    const cellData = over.data.current as CellDropData | undefined;
    if (!piece || !cellData) return;
    if (!canPlace(piece.shape, cellData.row, cellData.col, board)) return; // invalid drop — piece just stays in hand

    playPlace();
    let nextBoard = placeShape(piece.shape, cellData.row, cellData.col, board, piece.color);
    const newScore = score + piece.shape.cells.length;
    setScore(newScore);

    const { rows, cols } = getFullLines(nextBoard);
    if (rows.length > 0 || cols.length > 0) {
      nextBoard = clearLines(nextBoard, rows, cols);
    }
    setBoard(nextBoard);

    const remainingHand = hand.filter((p) => p.instanceId !== piece.instanceId);
    setHand(remainingHand);

    if (remainingHand.length === 0) {
      startAnsweringPhase(pool, servedIds);
      return;
    }

    if (!hasAnyValidPlacement(remainingHand, nextBoard)) {
      endGame(newScore);
    }
  };

  const handleCorrect = () => {
    if (!currentQuestion) return;
    playCorrect();

    const nextServed = new Set(servedIds).add(currentQuestion.id);
    setServedIds(nextServed);
    setCurrentQuestion(null);

    const newHand = getRandomHand(HAND_SIZE);
    if (!hasAnyValidPlacement(newHand, board)) {
      endGame(score);
      return;
    }
    setHand(newHand);
    setPhase("placing");
  };

  const handleSkip = () => {
    if (!currentQuestion || heartsRemaining <= 0) return;
    setHeartsRemaining((h) => h - 1);

    let nextServed = new Set(servedIds).add(currentQuestion.id);
    let next = pickNextQuestion(pool, nextServed);
    if (!next) {
      nextServed = new Set();
      next = pickNextQuestion(pool, nextServed);
    }
    setServedIds(nextServed);
    setCurrentQuestion(next);
  };

  if (phase === "loading" || phase === "ending") {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-[#8B6914]" />
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="mx-auto flex max-w-4xl flex-col gap-6 md:flex-row md:items-start">
        {phase === "answering" && currentQuestion && (
          <div className="md:w-1/2">
            <BlocksQuestionPanel
              question={currentQuestion}
              heartsRemaining={heartsRemaining}
              onCorrect={handleCorrect}
              onSkip={handleSkip}
            />
          </div>
        )}

        <div className={phase === "answering" ? "md:w-1/2" : "mx-auto"}>
          <div className="mb-2 flex items-center justify-between text-sm font-semibold text-text-main">
            <span>Score: {score}</span>
            <span className="flex items-center gap-1 text-amber-600">
              <Trophy size={14} /> {Math.max(storedHighScore, score)}
            </span>
          </div>
          <div className="flex items-start gap-3">
            <BlocksPieceTray hand={hand} />
            <BlocksBoard board={board} dragPreview={dragPreview} />
          </div>
        </div>
      </div>
    </DndContext>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/discover/blocks/BlocksGame.tsx
git commit -m "feat(blocks): add BlocksGame state machine orchestrating the full game loop"
```

---

### Task 12: Intro and game-over views (`BlocksIntro.tsx`, `BlocksGameOver.tsx`)

**Files:**
- Create: `src/components/discover/blocks/BlocksIntro.tsx`
- Create: `src/components/discover/blocks/BlocksGameOver.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure presentational components, no game state).
- Produces: `<BlocksIntro onStart={fn} />` and `<BlocksGameOver finalScore={number} highScore={number} onPlayAgain={fn} onBackToDiscover={fn} />` — both consumed by `blocks/page.tsx` (Task 13).

No test file (see Global Constraints).

- [ ] **Step 1: Write `BlocksIntro.tsx`**

```tsx
// src/components/discover/blocks/BlocksIntro.tsx
"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface BlocksIntroProps {
  onStart: () => void;
}

export default function BlocksIntro({ onStart }: BlocksIntroProps) {
  const [showInstructions, setShowInstructions] = useState(false);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1a1a2e] text-2xl font-black text-white">
        B
      </div>
      <h1 className="text-2xl font-bold text-[#1a1a2e]">Build, Play, And Learn With Blocks!</h1>
      <p className="max-w-sm text-sm text-gray-500">Answer questions, build with blocks, and make studying fun!</p>

      <div className="mt-2 flex flex-col gap-3">
        <button
          type="button"
          onClick={onStart}
          className="rounded-full bg-[#1a1a2e] px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2a2a3e]"
        >
          Play Blocks
        </button>
        <button
          type="button"
          onClick={() => setShowInstructions(true)}
          className="rounded-full border border-border-light bg-bg-warm px-8 py-3 text-sm font-semibold text-[#1a1a2e] transition-colors hover:bg-[#F5F0EB]"
        >
          How to Play
        </button>
      </div>

      {showInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 text-left shadow-xl">
            <button
              type="button"
              onClick={() => setShowInstructions(false)}
              aria-label="Close instructions"
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
            <h2 className="mb-3 text-lg font-bold text-[#1a1a2e]">How to Play</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm text-gray-600">
              <li>Drag pieces from your hand onto the 8×8 board.</li>
              <li>Fill a full row or column to clear it and free up space.</li>
              <li>Your score is the total number of blocks you place.</li>
              <li>Once you've placed all 4 pieces in your hand, answer a study question to earn your next 4.</li>
              <li>A wrong answer just shows the correct one — try again, no penalty.</li>
              <li>You get 3 skips per game if you want a different question.</li>
              <li>The game ends when none of your pieces can fit on the board anymore.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `BlocksGameOver.tsx`**

```tsx
// src/components/discover/blocks/BlocksGameOver.tsx
"use client";

import { Trophy } from "lucide-react";

interface BlocksGameOverProps {
  finalScore: number;
  highScore: number;
  onPlayAgain: () => void;
  onBackToDiscover: () => void;
}

export default function BlocksGameOver({ finalScore, highScore, onPlayAgain, onBackToDiscover }: BlocksGameOverProps) {
  const isNewHighScore = finalScore >= highScore && finalScore > 0;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-bold text-[#1a1a2e]">Game Over</h1>
      <p className="text-4xl font-black text-[#1a1a2e]">{finalScore}</p>
      <p className="text-sm text-gray-500">blocks placed</p>

      <div className="mt-2 flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">
        <Trophy size={16} />
        {isNewHighScore ? "New high score!" : `Best: ${highScore}`}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <button
          type="button"
          onClick={onPlayAgain}
          className="rounded-full bg-[#1a1a2e] px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2a2a3e]"
        >
          Play Again
        </button>
        <button
          type="button"
          onClick={onBackToDiscover}
          className="rounded-full border border-border-light bg-bg-warm px-8 py-3 text-sm font-semibold text-[#1a1a2e] transition-colors hover:bg-[#F5F0EB]"
        >
          Back to Discover
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/discover/blocks/BlocksIntro.tsx src/components/discover/blocks/BlocksGameOver.tsx
git commit -m "feat(blocks): add intro and game-over screens"
```

---

### Task 13: Route (`blocks/page.tsx`)

**Files:**
- Create: `src/app/(course)/courses/[courseId]/discover/blocks/page.tsx`

**Interfaces:**
- Consumes: `BlocksIntro` (Task 12), `BlocksGame` (Task 11), `BlocksGameOver` (Task 12); `useAuth` from `@/src/context/AuthContext`.
- Produces: the `/courses/[courseId]/discover/blocks` route, owning the `intro` / `playing` / `gameover` view state (spec §2). Consumed by the Discover page's Play Blocks card (Task 14).

Follows the same auth-redirect pattern as the existing Discover page (`discover/page.tsx:54-59`): redirect to `/login` if not authenticated once the auth check settles. This task is where the full game becomes reachable, so it's the first point a genuine manual playthrough is possible.

- [ ] **Step 1: Write `blocks/page.tsx`**

```tsx
// src/app/(course)/courses/[courseId]/discover/blocks/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import BlocksIntro from "@/src/components/discover/blocks/BlocksIntro";
import BlocksGame from "@/src/components/discover/blocks/BlocksGame";
import BlocksGameOver from "@/src/components/discover/blocks/BlocksGameOver";

type View = "intro" | "playing" | "gameover";

export default function BlocksPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const courseId = params.courseId as string;

  const [view, setView] = useState<View>("intro");
  const [result, setResult] = useState<{ finalScore: number; highScore: number } | null>(null);
  // Bumped on "Play Again" to force BlocksGame to remount with fresh state,
  // rather than adding a manual reset path to its internal state machine.
  const [gameKey, setGameKey] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.push("/login");
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAF8]">
        <Loader2 size={32} className="animate-spin text-[#8B6914]" />
      </div>
    );
  }

  const handleGameOver = (finalScore: number, highScore: number) => {
    setResult({ finalScore, highScore });
    setView("gameover");
  };

  const handlePlayAgain = () => {
    setGameKey((k) => k + 1);
    setResult(null);
    setView("playing");
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] px-6 py-8 md:px-14">
      {view === "intro" && <BlocksIntro onStart={() => setView("playing")} />}
      {view === "playing" && <BlocksGame key={gameKey} uid={user.uid} onGameOver={handleGameOver} />}
      {view === "gameover" && result && (
        <BlocksGameOver
          finalScore={result.finalScore}
          highScore={result.highScore}
          onPlayAgain={handlePlayAgain}
          onBackToDiscover={() => router.push(`/courses/${courseId}/discover`)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, sign in, navigate to `http://localhost:3000/courses/<a real courseId you're enrolled in>/discover/blocks` directly.

Confirm:
- Intro screen renders with Play Blocks / How to Play buttons; How to Play opens and closes the instructions modal.
- Play Blocks starts the game; a loading spinner briefly shows, then the board + 4-piece tray appear.
- Dragging a piece plays the `move` sound on pick-up (if the audio files are present locally) and the `place` sound on a valid drop; an invalid drop (overlapping a filled cell or off-board) snaps back with no board change.
- After placing all 4 pieces, the question panel appears on the left with a real question pulled from your own quizzes/flashcards (or a graceful empty-pool fallback if you have none).
- Submitting a correct answer plays the `correct` sound and deals a new hand; a wrong answer reveals the correct choice and lets you retry the same question.
- The Skip button decrements the heart count and swaps to a different question; it disables at 0 hearts.
- Filling a full row/column visibly clears it.
- If you can, play until no piece fits — confirm the game-over screen shows your score and high-score comparison, and reloading `/courses/<courseId>/discover` then coming back shows the new high score persisted.

Report anything that doesn't match before moving to Task 14.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(course)/courses/[courseId]/discover/blocks/page.tsx"
git commit -m "feat(blocks): add the Blocks game route"
```

---

### Task 14: Discover page entry point

**Files:**
- Modify: `src/app/(course)/courses/[courseId]/discover/page.tsx`

**Interfaces:**
- Consumes: nothing new — this task only adds a link to the route from Task 13.
- Produces: the "Switch It Up With a Game" section on the Discover page, the last piece connecting the whole feature end to end.

- [ ] **Step 1: Add the `Gamepad2` icon to the existing lucide-react import**

In `src/app/(course)/courses/[courseId]/discover/page.tsx`, find:

```tsx
import { Compass, Loader2, AlertCircle, Sparkles } from 'lucide-react';
```

Replace with:

```tsx
import { Compass, Loader2, AlertCircle, Sparkles, Gamepad2 } from 'lucide-react';
```

- [ ] **Step 2: Insert the new section after "Learn Questions"**

Find the end of the Learn Questions section (currently the last section in the page body, right before the closing `</div>` of the `px-6 py-8 md:px-14` container):

```tsx
          ) : (
            <LearnQuestionsSession questions={learnQuestions} onStateChange={setLearnQuestionsState} />
          )}
        </section>
      </div>
```

Replace with:

```tsx
          ) : (
            <LearnQuestionsSession questions={learnQuestions} onStateChange={setLearnQuestionsState} />
          )}
        </section>

        {/* Switch It Up With a Game */}
        <section className="mt-8">
          <h2 className="text-lg font-bold text-[#1a1a2e] mb-1">Switch It Up With a Game</h2>
          <p className="text-sm text-gray-500 mb-4">
            Answer questions, build with blocks, and make studying fun.
          </p>

          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5">
            <div>
              <p className="text-sm font-semibold text-[#1a1a2e]">Blocks</p>
              <p className="text-xs text-gray-500">
                Place pieces on the board, answer questions to keep them coming.
              </p>
            </div>
            <button
              onClick={() => router.push(`/courses/${courseId}/discover/blocks`)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1a1a2e] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#2a2a3e]"
            >
              <Gamepad2 size={14} />
              Play Blocks
            </button>
          </div>
        </section>
      </div>
```

This reuses the already-in-scope `router` and `courseId` from the top of the component (`useRouter()` and `params.courseId` — both already defined earlier in this file), so no new hooks are needed.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, sign in, visit `/courses/<courseId>/discover`.

Confirm:
- The new "Switch It Up With a Game" section renders below Learn Questions, styled consistently with the rest of the page.
- Clicking "Play Blocks" navigates to `/courses/<courseId>/discover/blocks` and lands on the intro screen.
- No existing Discover page sections (recommended study sets, Learn Questions, the Catalyst AI panel) changed behavior.

- [ ] **Step 6: Full regression pass**

Run: `npm run test` and `npm run typecheck` one more time for the whole repo (not just this feature's files) to confirm nothing outside this feature's scope broke.
Expected: all existing tests still pass, no new type errors anywhere.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(course)/courses/[courseId]/discover/page.tsx"
git commit -m "feat(blocks): add Play Blocks entry point to the Discover page"
```

---

## Summary

| Task | File(s) | Depends on |
|---|---|---|
| 1 | `blocksTypes.ts` | — |
| 2 | `blocksShapes.ts` | 1 |
| 3 | `blocksLogic.ts` | 1 |
| 4 | `blocksSounds.ts` | — |
| 5 | `gameStats.ts` | — |
| 6 | `api/discover/learn-question/route.ts` (extend) | — |
| 7 | `blocksPool.ts` | 1, 6 |
| 8 | `BlocksBoard.tsx` + `@dnd-kit/*` | 1 |
| 9 | `BlocksPieceTray.tsx` | 1, 8 |
| 10 | `BlocksQuestionPanel.tsx` | 1 |
| 11 | `BlocksGame.tsx` | 1–5, 7–10 |
| 12 | `BlocksIntro.tsx`, `BlocksGameOver.tsx` | — |
| 13 | `blocks/page.tsx` | 11, 12 |
| 14 | `discover/page.tsx` (modify) | 13 |

Tasks 1–7 are pure-logic and can be built and reviewed independently of the UI; Tasks 8–10 are independent of each other and of 1–7 beyond their type imports. Everything converges at Task 11.

