"use client";

import { useEffect, useState } from "react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
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
import {
  HAND_SIZE,
  MAX_HEARTS,
  type Board,
  type BlocksQuestion,
  type DragPreview,
  type HandPiece,
} from "@/src/library/discover/blocksTypes";
import BlocksBoard from "./BlocksBoard";
import BlocksPieceTray from "./BlocksPieceTray";
import BlocksQuestionPanel from "./BlocksQuestionPanel";

interface BlocksGameProps {
  uid: string;
  onGameOver: (finalScore: number, highScore: number, beatHighScore: boolean) => void;
  isMuted?: boolean;
}

type Phase = "loading" | "placing" | "answering" | "ending";

interface CellDropData {
  row: number;
  col: number;
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
  const [currentQuestion, setCurrentQuestion] = useState<BlocksQuestion | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

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

  const handleDragStart = () => {
    if (!isMuted) playMove();
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
    if (!canPlace(piece.shape, cellData.row, cellData.col, board)) {
      setDragPreview(null);
      return;
    }
    setDragPreview({
      shape: piece.shape,
      anchorRow: cellData.row,
      anchorCol: cellData.col,
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

    if (!isMuted) playPlace();
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
      startAnsweringPhase(pool, servedIds, nextBoard);
      return;
    }

    if (!hasAnyValidPlacement(remainingHand, nextBoard)) {
      endGame(newScore);
    }
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
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
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
              <BlocksPieceTray hand={hand} />
              <BlocksBoard board={board} dragPreview={dragPreview} />
            </div>
          </div>
        </div>
      </div>
    </DndContext>
  );
}
