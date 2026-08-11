"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Loader2, Trophy } from "lucide-react";
import {
  clearLines,
  createEmptyBoard,
  getFullLines,
  hasAnyValidPlacement,
  measureBoardCellMetrics,
  placeShape,
  resolveDropAnchor,
  type RectLike,
} from "@/src/library/discover/blocksLogic";
import { getRandomHand } from "@/src/library/discover/blocksShapes";
import { playClear, playCorrect, playMove, playPlace } from "@/src/library/discover/blocksSounds";
import { buildBlocksPool, needsTopUp, pickNextQuestion, topUpPool } from "@/src/library/discover/blocksPool";
import { getBlocksHighScore, setBlocksHighScoreIfBeaten } from "@/src/library/gameStats";
import {
  CLEAR_ANIMATION_MS,
  HAND_SIZE,
  MAX_HEARTS,
  type Board,
  type BlocksQuestion,
  type ClearingLines,
  type DragPreview,
  type HandPiece,
} from "@/src/library/discover/blocksTypes";
import BlocksBoard from "./BlocksBoard";
import BlocksDragOverlayPiece from "./BlocksDragOverlayPiece";
import BlocksPieceTray from "./BlocksPieceTray";
import BlocksQuestionPanel from "./BlocksQuestionPanel";

interface BlocksGameProps {
  uid: string;
  onGameOver: (finalScore: number, highScore: number, beatHighScore: boolean) => void;
  isMuted?: boolean;
}

type Phase = "loading" | "placing" | "answering" | "ending";

function getPieceCellRect(dr: number, dc: number): RectLike | null {
  const el = document.querySelector(`#blocks-drag-overlay [data-cell-row="${dr}"][data-cell-col="${dc}"]`);
  return el ? el.getBoundingClientRect() : null;
}

function getBoardCellRect(row: number, col: number): RectLike | null {
  const el = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
  return el ? el.getBoundingClientRect() : null;
}

export default function BlocksGame({ uid, onGameOver, isMuted = false }: BlocksGameProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [board, setBoard] = useState<Board>(() => createEmptyBoard());
  const [hand, setHand] = useState<HandPiece[]>([]);
  const [score, setScore] = useState(0);
  const [storedHighScore, setStoredHighScore] = useState(0);
  const [heartsRemaining, setHeartsRemaining] = useState(MAX_HEARTS);
  const [pool, setPool] = useState<BlocksQuestion[]>([]);
  const [servedIds, setServedIds] = useState<Set<string>>(new Set());
  const poolRef = useRef<BlocksQuestion[]>([]);
  const servedIdsRef = useRef<Set<string>>(new Set());
  const [currentQuestion, setCurrentQuestion] = useState<BlocksQuestion | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [activePiece, setActivePiece] = useState<HandPiece | null>(null);
  const [boardCellMetrics, setBoardCellMetrics] = useState<{ size: number; gap: number } | null>(null);
  const latestAnchorRef = useRef<{ row: number; col: number } | null>(null);
  const [clearingLines, setClearingLines] = useState<ClearingLines | null>(null);
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    poolRef.current = pool;
  }, [pool]);

  useEffect(() => {
    servedIdsRef.current = servedIds;
  }, [servedIds]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [builtPool, existingHighScore] = await Promise.all([buildBlocksPool(uid), getBlocksHighScore(uid)]);
        if (cancelled) return;
        setPool(builtPool);
        setStoredHighScore(existingHighScore);
        setHand(getRandomHand(HAND_SIZE));
        setBoard(createEmptyBoard());
        setPhase("placing");
      } catch (error) {
        console.error("Failed to initialize Blocks game:", error);
        if (cancelled) return;
        setPool([]);
        setHand(getRandomHand(HAND_SIZE));
        setBoard(createEmptyBoard());
        setPhase("placing");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    return () => {
      if (clearTimeoutRef.current !== null) {
        clearTimeout(clearTimeoutRef.current);
        clearTimeoutRef.current = null;
      }
    };
  }, []);

  const maybeTopUp = (currentPool: BlocksQuestion[], currentServed: Set<string>) => {
    if (!needsTopUp(currentPool, currentServed)) return;
    topUpPool(currentPool, uid).then((updated) => setPool(updated));
  };

  const endGame = async (finalScore: number) => {
    setPhase("ending");
    await setBlocksHighScoreIfBeaten(uid, finalScore);
    onGameOver(finalScore, Math.max(finalScore, storedHighScore), finalScore > storedHighScore);
  };

  const startAnsweringPhase = (
    currentPool: BlocksQuestion[],
    currentServed: Set<string>,
    boardForCheck: Board = board,
  ) => {
    if (currentPool.length === 0) {
      // No questions were ever available (e.g. a brand-new account with no
      // quizzes/flashcards yet) — skip the gate rather than block the game.
      const newHand = getRandomHand(HAND_SIZE);
      if (!hasAnyValidPlacement(newHand, boardForCheck)) {
        endGame(score);
        return;
      }
      setHand(newHand);
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

  const finishPlacement = (
    nextBoard: Board,
    remainingHand: HandPiece[],
    newScore: number,
    currentPool: BlocksQuestion[],
    currentServed: Set<string>,
  ) => {
    setBoard(nextBoard);
    setHand(remainingHand);
    setClearingLines(null);

    if (remainingHand.length === 0) {
      startAnsweringPhase(currentPool, currentServed, nextBoard);
      return;
    }

    if (!hasAnyValidPlacement(remainingHand, nextBoard)) {
      endGame(newScore);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    if (clearingLines) return;
    if (!isMuted) playMove();
    const piece = hand.find((p) => `piece-${p.instanceId}` === event.active.id);
    setActivePiece(piece ?? null);
    setBoardCellMetrics(measureBoardCellMetrics());
  };

  const handleDragCancel = () => {
    setDragPreview(null);
    setActivePiece(null);
    setBoardCellMetrics(null);
    latestAnchorRef.current = null;
  };

  const handleDragMove = (event: DragMoveEvent) => {
    if (clearingLines) {
      latestAnchorRef.current = null;
      setDragPreview(null);
      return;
    }
    const { active, over } = event;
    if (!over) {
      latestAnchorRef.current = null;
      setDragPreview(null);
      return;
    }
    const piece = hand.find((p) => `piece-${p.instanceId}` === active.id);
    if (!piece) {
      latestAnchorRef.current = null;
      setDragPreview(null);
      return;
    }
    const anchor = resolveDropAnchor(piece.shape, getPieceCellRect, getBoardCellRect, board);
    latestAnchorRef.current = anchor;
    if (!anchor) {
      setDragPreview(null);
      return;
    }
    setDragPreview({ shape: piece.shape, anchorRow: anchor.row, anchorCol: anchor.col });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const anchor = latestAnchorRef.current;
    setDragPreview(null);
    setActivePiece(null);
    setBoardCellMetrics(null);
    latestAnchorRef.current = null;

    if (clearingLines) return;

    const piece = hand.find((p) => `piece-${p.instanceId}` === event.active.id);
    if (!piece || !anchor) return; // invalid drop — piece just stays in hand

    if (!isMuted) playPlace();
    const placedBoard = placeShape(piece.shape, anchor.row, anchor.col, board, piece.color);
    const newScore = score + piece.shape.cells.length;
    setScore(newScore);

    const remainingHand = hand.filter((p) => p.instanceId !== piece.instanceId);
    const { rows, cols } = getFullLines(placedBoard);

    if (rows.length === 0 && cols.length === 0) {
      finishPlacement(placedBoard, remainingHand, newScore, pool, servedIds);
      return;
    }

    // Keep filled lines on the board, play clear sound, animate, then empty.
    setBoard(placedBoard);
    setHand(remainingHand);
    setClearingLines({ rows, cols });
    if (!isMuted) playClear();

    if (clearTimeoutRef.current !== null) clearTimeout(clearTimeoutRef.current);
    clearTimeoutRef.current = setTimeout(() => {
      clearTimeoutRef.current = null;
      const clearedBoard = clearLines(placedBoard, rows, cols);
      finishPlacement(clearedBoard, remainingHand, newScore, poolRef.current, servedIdsRef.current);
    }, CLEAR_ANIMATION_MS);
  };

  const handleCorrect = () => {
    if (!currentQuestion) return;
    if (!isMuted) playCorrect();

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
    if (next?.id === currentQuestion.id) {
      setCurrentQuestion(null);
      queueMicrotask(() => setCurrentQuestion(next));
      return;
    }
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
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex min-h-[calc(100vh-120px)] items-start justify-center pt-8 md:pt-12">
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
              <BlocksPieceTray hand={hand} disabled={clearingLines !== null} />
              <BlocksBoard board={board} dragPreview={dragPreview} clearingLines={clearingLines} />
            </div>
          </div>
        </div>
      </div>
      <DragOverlay>
        {activePiece && boardCellMetrics ? (
          <BlocksDragOverlayPiece piece={activePiece} cellSize={boardCellMetrics.size} gap={boardCellMetrics.gap} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
