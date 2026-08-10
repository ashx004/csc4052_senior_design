# Blocks Game — Design Spec

**Status:** Approved
**Date:** 2026-08-09

## 1. Overview

"Blocks" is a block-puzzle grid game (Block Blast / 1010!-style) on the Discover page. Players place tetromino-style pieces onto an 8×8 board; once their hand of pieces is empty, they must answer a study question (drawn from their own quizzes and flashcards) to earn the next hand. It turns already-studied material into a study-gated puzzle game, reusing the existing "Learn Questions" cross-course pattern but broadened to more question types and a longer play session.

## 2. Entry flow & routing

- Discover page (`src/app/(course)/courses/[courseId]/discover/page.tsx`) gets a new "Switch It Up With a Game" section containing a **Play Blocks** card.
- Clicking the card navigates to a new route: `src/app/(course)/courses/[courseId]/discover/blocks/page.tsx`.
- That page is a single route holding three internal view states, no sub-routing:
  - **`intro`** — game title/tagline, "Play Blocks" button (starts the game), "How to Play" button (opens an instructions modal over the intro screen, explains controls/scoring/question gate)
  - **`playing`** — the active game (board, hand, question panel)
  - **`gameover`** — final score, comparison against the player's persisted high score, "Play Again" (resets to a fresh game) and "Back to Discover" buttons

## 3. Question pool (data source)

Cross-course pool, same aggregation scope as the existing Learn Questions widget (all of the user's active-enrollment courses), but pulling more question types and sources. Built by a new module, `src/library/discover/blocksPool.ts`.

### 3.1 Pool item type

```ts
// src/library/discover/blocksTypes.ts
export type BlocksQuestion = BlocksSingleQuestion | BlocksMatchingQuestion;

export interface BlocksSingleQuestion {
  id: string;
  kind: "single";
  type: "multiple_choice" | "true_false";
  question: string;
  options: string[];
  correctAnswer: string;
  sourceCourse: string; // display name, e.g. "CSC 325 — Advance Data Structure"
  sourceSet: string; // quiz/flashcard set name
  explanation?: string;
}

export interface BlocksMatchingQuestion {
  id: string;
  kind: "matching";
  sourceCourse: string;
  sourceSet: string;
  pairs: { term: string; definition: string }[]; // length >= 3
}
```

### 3.2 Sources

For each active-enrollment course:

- **Quiz sets** (`users/{uid}/enrollment/{courseId}/quizSets`):
  - Existing `multiple_choice` / `true_false` questions → `BlocksSingleQuestion`, same extraction as `buildLearnQuestionsSession` in `learnQuestions.ts`.
  - Existing `matching` questions, grouped by `matchingGroupId` → `BlocksMatchingQuestion`, **only if the group has 3 or more pairs** (groups smaller than that are skipped).
- **Flashcard sets** (≥ 3 cards):
  - Auto-generate `multiple_choice`/`true_false` questions on demand via the AI route, same pattern as the existing `/api/discover/learn-questions` fallback (generated fresh each pool build — not cached back onto the flashcard set).
  - Additionally, sample 3–5 cards from the set (front = term, back = definition) to form one `BlocksMatchingQuestion` — no AI call needed for this part.

### 3.3 Pool sizing & top-up

Unlike Learn Questions (fixed 10-question session), a Blocks game can run for as long as the board holds out, so the pool must be able to replenish:

- On game start, build the initial pool from all available sources above (no fixed cap).
- Track which questions have been served this game. When fewer than 5 unserved questions remain in the pool, call the AI generation route again in the background to top it up (same course/topic context as `generateMissingQuestions` in `learnQuestions.ts`), merging results into the live pool.
- If AI generation fails, fall back to reshuffling and re-serving already-used questions rather than blocking the game.

## 4. Board & piece mechanics

- **Board:** 8×8 grid.
- **Piece set:** standard block-puzzle shapes, defined in `src/library/discover/blocksShapes.ts` as arrays of relative `[row, col]` cell offsets. Representative catalog (rotations included as separate entries):
  - Single: `[[0,0]]`
  - Domino: horizontal `[[0,0],[0,1]]`, vertical `[[0,0],[1,0]]`
  - Tromino line: horizontal (3 cells), vertical (3 cells)
  - Tromino-L: 4 rotations, e.g. `[[0,0],[1,0],[1,1]]`
  - Tetromino-I: horizontal (4 cells), vertical (4 cells)
  - Tetromino-O (2×2 square): `[[0,0],[0,1],[1,0],[1,1]]`
  - Tetromino-T: 4 rotations
  - Tetromino-S / Tetromino-Z: 2 orientations each
  - Tetromino-L / Tetromino-J: 4 rotations each
  - Piece cell count ranges 1–5. Colors are decorative — cycled/randomized per piece, not tied to course or question source.
- **Hand:** 4 pieces at a time, randomly drawn from the shape catalog (with replacement) each time the hand is refilled.
- **Placement:** drag-and-drop, using `dnd-kit` (new dependency — the repo has no existing DnD library). Player drags a piece from the tray onto the board; a valid-drop preview highlights the target cells; invalid placements (out of bounds or overlapping filled cells) are rejected and the piece returns to the tray.
- **Sounds:** `move` plays on drag start, `place` plays on a successful drop (see §6).
- **Line clearing:** after every successful placement, check all 8 rows and 8 columns; any that are completely filled are cleared (cells emptied) with a brief clear animation. Clearing does not affect the score (§5).

## 5. Game loop, question gate & scoring

**Round loop:**

1. Player places all 4 pieces from the current hand onto the board, one at a time (drag-and-drop). Each successful placement increments the score by that piece's cell count, and triggers a line-clear check.
2. Once the hand is empty, the question panel appears with the next unserved question from the pool (§3).
3. **Rendering by type:**
   - `multiple_choice` / `true_false`: list of option buttons (click to select, does not auto-submit) plus a **Submit** button.
   - `matching`: reuses the existing click-term-then-click-definition interaction from `src/components/quizzes/MatchingQuestionGroup.tsx` (terms left column, definitions right column), plus a **Submit** button that grades all pairs at once.
4. **On Submit:**
   - **Correct** → play the `correct` sound, question panel animates away (slide/fade), a new hand of 4 random pieces slides into the tray, player resumes placing. Mark the question as served.
   - **Incorrect** → reveal the correct answer inline (same visual treatment as the existing Learn Questions reveal state — correct option highlighted green, selected wrong option highlighted red). The *same* question remains on screen; the player can select again and resubmit. No new hand is granted until answered correctly.
5. **Skip ("hearts"):** a Refresh control next to Submit lets the player discard the current question for a different one drawn from the pool, without answering it. Capped at **3 uses per game** (a visible heart/counter tracks remaining uses); once exhausted, the Refresh control disables. This is the only way to bypass a specific question — an incorrect Submit does not skip it.
6. **Game over condition:** after every placement/clear cycle, check whether any piece currently in the 4-piece hand can be legally placed anywhere on the board. If none can, the game ends immediately (even if the hand isn't empty) and the view transitions to `gameover`.

**Scoring:** score is a running total of cells placed over the entire game — incremented on each successful placement, never decremented by line clears.

## 6. Sounds

Three sound effects, no background music:

| Sound | Trigger |
|---|---|
| `move` | A piece is picked up (drag start) |
| `place` | A piece is successfully dropped onto the board |
| `correct` | A question is answered correctly |

No sound plays on incorrect answers or on skip. Audio files are provided by the project owner and referenced as placeholder paths until supplied:

- `/public/sounds/blocks/move.mp3`
- `/public/sounds/blocks/place.mp3`
- `/public/sounds/blocks/correct.mp3`

Playback is wrapped in `src/library/discover/blocksSounds.ts`, a thin helper around `HTMLAudioElement`: each call clones a preloaded `<audio>` node and plays the clone, so rapid overlapping triggers (e.g. `move` then `place` in quick succession) don't cut each other off. If a sound file 404s or fails to load, playback is caught and silently no-ops, so the game still works before the final audio assets are dropped in.

## 7. Persistence (high score)

A single field on the existing top-level `users/{uid}` Firestore document:

```ts
blocksHighScore: number
```

Follows the existing flat-field-with-typed-getter convention used for `learnerProfileMessageCount` in `src/library/studentProfile.ts` (not a subcollection). Read once when the game starts (`playing` state begins) to show the trophy baseline in the HUD; written once at game-over, and only if the just-finished score beats the stored value. No other game state is persisted — reloading mid-game loses the run, matching the existing in-memory-only behavior of `LearnQuestionsSession`.

## 8. Component & file architecture

New files:

- `src/library/discover/blocksTypes.ts` — `BlocksQuestion`/`BlocksSingleQuestion`/`BlocksMatchingQuestion` types (§3.1), plus board/piece types (`BoardCell`, `PieceShape`, `HandPiece`).
- `src/library/discover/blocksPool.ts` — builds and tops up the mixed question pool (§3).
- `src/library/discover/blocksShapes.ts` — piece shape catalog and random-piece generator (§4).
- `src/library/discover/blocksSounds.ts` — sound playback helper (§6).
- `src/library/gameStats.ts` — `getBlocksHighScore(uid)` / `setBlocksHighScoreIfBeaten(uid, score)` (§7).
- `src/app/(course)/courses/[courseId]/discover/blocks/page.tsx` — route; owns the `intro` / `playing` / `gameover` view state.
- `src/components/discover/blocks/BlocksIntro.tsx` — intro screen + instructions modal.
- `src/components/discover/blocks/BlocksGame.tsx` — orchestrator: board state, hand state, score, hearts-remaining, question-gate flow; composes the pieces below.
- `src/components/discover/blocks/BlocksBoard.tsx` — 8×8 grid rendering, drop targets, clear animation.
- `src/components/discover/blocks/BlocksPieceTray.tsx` — renders the 4 draggable hand pieces.
- `src/components/discover/blocks/BlocksQuestionPanel.tsx` — renders MC/TF or Matching questions plus Submit/Refresh controls.
- `src/components/discover/blocks/BlocksGameOver.tsx` — final score + high-score comparison + restart controls.

Modified files:

- `src/app/(course)/courses/[courseId]/discover/page.tsx` — add the "Switch It Up With a Game" section and Play Blocks card.
- `package.json` — add `dnd-kit` (drag-and-drop).

## 9. Out of scope

- Leaderboards or any cross-user score comparison.
- Multiplayer.
- Background music.
- Resuming a game after a page reload or navigation away.
- Any question type other than multiple-choice, true/false, and matching (e.g. no short-answer/essay).
- Matching groups/samples with fewer than 3 pairs.
