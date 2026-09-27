"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Minimize2, Move, Pause, Play } from "lucide-react";
import { useStudyPlanContext } from "@/src/context/StudyPlanContext";
import { formatElapsedTime } from "@/src/library/studyPlan/sessionTimer";
import {
  CORNER_POSITIONS,
  EXPANDED_STATE_HINTS,
  EXPANDED_STATE_MESSAGES,
  STATE_BADGES,
  STATE_COLORS,
  WIDGET_STATE_CONFIG,
} from "@/src/library/studyPlan/chickenConfig";
import ChickenAvatar from "./ChickenAvatar";
import type { CardCorner, ChickenState, FocusCardState } from "@/src/library/studyPlan/types";

const CORNERS: CardCorner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function getNearestCorner(x: number, y: number): CardCorner {
  const midX = window.innerWidth / 2;
  const midY = window.innerHeight / 2;
  if (x < midX) return y < midY ? "top-left" : "bottom-left";
  return y < midY ? "top-right" : "bottom-right";
}

function cornerStyle(corner: CardCorner): CSSProperties {
  const pos = CORNER_POSITIONS[corner];
  return {
    top: pos.top ? `max(${pos.top}, env(safe-area-inset-top))` : undefined,
    bottom: pos.bottom
      ? `max(${pos.bottom}, env(safe-area-inset-bottom))`
      : undefined,
    left: pos.left ? `max(${pos.left}, env(safe-area-inset-left))` : undefined,
    right: pos.right ? `max(${pos.right}, env(safe-area-inset-right))` : undefined,
  };
}

function shiftCorner(corner: CardCorner, key: string): CardCorner {
  const vertical = corner.startsWith("top") ? "top" : "bottom";
  const horizontal = corner.endsWith("left") ? "left" : "right";
  if (key === "ArrowLeft") return `${vertical}-left` as CardCorner;
  if (key === "ArrowRight") return `${vertical}-right` as CardCorner;
  if (key === "ArrowUp") return `top-${horizontal}` as CardCorner;
  if (key === "ArrowDown") return `bottom-${horizontal}` as CardCorner;
  return corner;
}

export default function FocusCard() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const {
    focusCard,
    pauseSession,
    resumeSession,
    completeSession,
    abandonSession,
    updateTaskStatus,
    setMinimized,
    setCorner,
  } = useStudyPlanContext();

  const constraintsRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<FocusCardState | null>(null);
  const suppressClickRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const hiddenAtRef = useRef<number | null>(null);
  const prevChickenRef = useRef<string | null>(null);
  const diedDuringSessionRef = useRef<string | null>(null);

  const [breakState, setBreakState] = useState<{
    active: boolean;
    secondsLeft: number;
  } | null>(null);
  const [terminal, setTerminal] = useState<"dead" | "complete" | null>(null);

  if (focusCard) snapshotRef.current = focusCard;
  const card = focusCard ?? snapshotRef.current;

  useEffect(() => {
    if (!focusCard?.visible || focusCard.mode === "paused" || terminal || breakState?.active) {
      return;
    }

    const resetActivity = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener("mousemove", resetActivity);
    window.addEventListener("keydown", resetActivity);
    window.addEventListener("click", resetActivity);
    window.addEventListener("scroll", resetActivity, true);

    const idleCheck = setInterval(() => {
      if (Date.now() - lastActivityRef.current > 5 * 60 * 1000) {
        pauseSession();
      }
    }, 30_000);

    return () => {
      window.removeEventListener("mousemove", resetActivity);
      window.removeEventListener("keydown", resetActivity);
      window.removeEventListener("click", resetActivity);
      window.removeEventListener("scroll", resetActivity, true);
      clearInterval(idleCheck);
    };
  }, [focusCard?.visible, focusCard?.mode, pauseSession, terminal, breakState?.active]);

  useEffect(() => {
    if (!focusCard?.visible || focusCard.mode === "paused") return;

    const handleVisibility = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else if (hiddenAtRef.current) {
        const elapsed = Date.now() - hiddenAtRef.current;
        hiddenAtRef.current = null;
        if (elapsed > 60_000) {
          const taskId = focusCard.taskId;
          diedDuringSessionRef.current = focusCard.sessionId;
          abandonSession();
          if (taskId) updateTaskStatus(taskId, "recommended");
          setTerminal("dead");
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [focusCard?.visible, focusCard?.mode, focusCard?.taskId, focusCard?.sessionId, abandonSession, updateTaskStatus]);

  useEffect(() => {
    const current = focusCard?.chickenState ?? null;
    if (prevChickenRef.current !== "complete" && current === "complete" && !breakState?.active) {
      const celebrationTimer = window.setTimeout(() => {
        setBreakState({ active: true, secondsLeft: 300 });
        setTerminal(null);
      }, 2000);
      prevChickenRef.current = current;
      return () => window.clearTimeout(celebrationTimer);
    }
    prevChickenRef.current = current;
  }, [focusCard?.chickenState, breakState?.active]);

  useEffect(() => {
    if (!breakState?.active) return;
    const timer = window.setInterval(() => {
      setBreakState((prev) => {
        if (!prev || prev.secondsLeft <= 1) return null;
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [breakState?.active]);

  useEffect(() => {
    if (
      terminal === "dead" &&
      focusCard?.visible &&
      diedDuringSessionRef.current &&
      focusCard.sessionId !== diedDuringSessionRef.current
    ) {
      setTerminal(null);
    }
  }, [focusCard?.sessionId, focusCard?.visible, terminal]);

  const handleDragEnd = useCallback(
    (_: unknown, info: { point: { x: number; y: number }; offset: { x: number; y: number } }) => {
      const moved = Math.abs(info.offset.x) > 6 || Math.abs(info.offset.y) > 6;
      if (!moved) return;
      suppressClickRef.current = true;
      setCorner(getNearestCorner(info.point.x, info.point.y));
    },
    [setCorner]
  );

  const visible = Boolean(focusCard?.visible || terminal || breakState?.active);
  if (!visible || !card) return null;

  const chickenState: ChickenState = breakState?.active
    ? "break"
    : terminal === "dead"
      ? "dead"
      : terminal === "complete"
        ? "complete"
        : card.chickenState;

  const displaySeconds = breakState?.active
    ? breakState.secondsLeft
    : card.timerMode === "countdown" && card.targetSeconds
      ? Math.max(0, card.targetSeconds - card.elapsedSeconds)
      : card.elapsedSeconds;
  const displayTime =
    chickenState === "dead"
      ? "Gave up"
      : chickenState === "complete"
        ? "Done"
        : formatClock(displaySeconds);

  const widgetConfig = WIDGET_STATE_CONFIG[chickenState] ?? WIDGET_STATE_CONFIG.growing;
  const stateColors = STATE_COLORS[chickenState];
  const timerColor =
    chickenState === "complete"
      ? "#1F6B30"
      : chickenState === "paused"
        ? "#92400E"
        : chickenState === "dead"
          ? "#B91C1C"
          : chickenState === "break"
            ? "#1D4ED8"
            : "#1A1A30";
  const widgetButtonStyle =
    widgetConfig.buttonBg === "white"
      ? { backgroundColor: "#1A1A30", color: "#FFFFFF" }
      : { backgroundColor: widgetConfig.buttonBg, color: "#1A1A30" };
  const statusMessage = EXPANDED_STATE_MESSAGES[chickenState];
  const hint = EXPANDED_STATE_HINTS[chickenState];
  const title =
    card.taskTitle || (card.taskId ? "" : "Focus session");
  const spring = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 300, damping: 30 };

  const handleDone = async () => {
    if (focusCard?.visible) {
      await completeSession();
      if (card.taskId) await updateTaskStatus(card.taskId, "completed");
    }
    setTerminal("complete");
    window.setTimeout(() => {
      setTerminal(null);
      setBreakState({ active: true, secondsLeft: 300 });
    }, 2000);
  };

  const handleQuit = async () => {
    if (focusCard?.visible) {
      await abandonSession();
      if (card.taskId) await updateTaskStatus(card.taskId, "recommended");
    }
    diedDuringSessionRef.current = card.sessionId;
    setBreakState(null);
    setTerminal("dead");
  };

  const handleRestart = () => {
    setTerminal(null);
    setBreakState(null);
    router.push("/learning");
  };

  const handleSkipBreak = () => setBreakState(null);

  const handleWidgetAction = () => {
    if (chickenState === "paused") resumeSession();
    else if (chickenState === "complete") {
      if (focusCard?.visible) setMinimized(false);
      else {
        setTerminal(null);
        setBreakState({ active: true, secondsLeft: 300 });
      }
    }
    else if (chickenState === "dead") handleRestart();
    else if (chickenState === "break") handleSkipBreak();
    else handleQuit();
  };

  const onCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    setCorner(shiftCorner(card.corner, event.key));
  };

  const stopDrag = (event: PointerEvent) => {
    event.stopPropagation();
  };

  const buttonClass =
    "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] px-3 text-xs font-semibold transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none motion-reduce:active:scale-100";

  return (
    <>
      <div ref={constraintsRef} className="pointer-events-none fixed inset-0 z-30" />

      <AnimatePresence mode="wait">
        {card.isMinimized ? (
          <motion.div
            key="minimized"
            drag
            dragConstraints={constraintsRef}
            dragElastic={0.1}
            dragSnapToOrigin
            onDragEnd={handleDragEnd}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96 }}
            transition={spring}
            role="region"
            aria-label={`${statusMessage} ${chickenState === "dead" || chickenState === "complete" ? displayTime : formatElapsedTime(displaySeconds)}`}
            tabIndex={0}
            onKeyDown={onCardKeyDown}
            className="fixed z-[60] flex w-[min(340px,calc(100vw-24px))] cursor-grab select-none items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-[0_8px_30px_rgba(26,26,48,0.14)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy active:cursor-grabbing"
            style={{
              ...cornerStyle(card.corner),
              touchAction: "none",
            }}
            onClick={(event) => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              if ((event.target as HTMLElement).closest("button")) return;
              setMinimized(false);
            }}
          >
            <ChickenAvatar state={chickenState} size="minimized" />

            <div className="min-w-0 flex-1">
              <span
                className="block text-[11px] font-semibold tracking-wide"
                style={{ color: stateColors.labelText }}
              >
                {widgetConfig.label}
              </span>
              <span
                className="mt-0.5 flex items-center gap-1 text-2xl font-extrabold leading-none tabular-nums"
                style={{ color: timerColor }}
              >
                {chickenState === "paused" && <Pause size={16} aria-hidden />}
                {chickenState === "complete" && <Check size={16} aria-hidden />}
                {displayTime}
              </span>
            </div>

            <button
              type="button"
              onPointerDown={stopDrag}
              onClick={(event) => {
                event.stopPropagation();
                handleWidgetAction();
              }}
              className="min-h-11 shrink-0 cursor-pointer rounded-[10px] px-3.5 text-[13px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy active:scale-[0.98] motion-reduce:active:scale-100"
              style={widgetButtonStyle}
            >
              {widgetConfig.buttonText}
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            drag
            dragConstraints={constraintsRef}
            dragElastic={0.1}
            dragSnapToOrigin
            onDragEnd={handleDragEnd}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96 }}
            transition={spring}
            role="region"
            aria-label={`${statusMessage}. ${displayTime}`}
            tabIndex={0}
            onKeyDown={onCardKeyDown}
            className="fixed z-[60] w-[min(240px,calc(100vw-24px))] cursor-grab select-none rounded-[20px] bg-white p-4 shadow-[0_8px_30px_rgba(26,26,48,0.14)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy active:cursor-grabbing"
            style={{
              ...cornerStyle(card.corner),
              touchAction: "none",
            }}
          >
            <div className="flex justify-center">
              <span
                className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                style={{ backgroundColor: stateColors.labelBg, color: stateColors.labelText }}
              >
                {STATE_BADGES[chickenState]}
              </span>
            </div>

            <div className="mt-2 flex justify-center">
              <ChickenAvatar state={chickenState} size="expanded" />
            </div>

            <p
              className="mt-2 text-center text-[13px] italic leading-snug"
              style={{ color: stateColors.labelText }}
            >
              {statusMessage}
            </p>

            <p
              className="mt-2 flex items-center justify-center gap-1 text-center text-[28px] font-extrabold leading-none tabular-nums"
              style={{ color: timerColor }}
            >
              {chickenState === "complete" && <Check size={22} aria-hidden />}
              {chickenState === "paused" && <Pause size={18} aria-hidden />}
              {displayTime}
            </p>

            <p className="mt-1 text-center text-[11px] text-gray-secondary">{hint}</p>

            {title && (
              <p className="mt-1 truncate text-center text-[11px] text-gray-secondary">
                {title}
                {card.courseCode ? ` · ${card.courseCode}` : ""}
              </p>
            )}

            <div className="mt-3 flex flex-col gap-2">
              {chickenState === "break" ? (
                <button
                  type="button"
                  onPointerDown={stopDrag}
                  onClick={handleSkipBreak}
                  className={`${buttonClass} border border-gray-light bg-white text-navy focus-visible:outline-navy`}
                >
                  Skip break
                </button>
              ) : chickenState === "dead" ? (
                <>
                  <button
                    type="button"
                    onPointerDown={stopDrag}
                    onClick={handleRestart}
                    className={`${buttonClass} bg-navy text-white focus-visible:outline-navy`}
                  >
                    Restart
                  </button>
                  <button
                    type="button"
                    onPointerDown={stopDrag}
                    onClick={() => router.push("/learning")}
                    className="min-h-11 cursor-pointer text-center text-xs font-semibold text-[#B91C1C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                  >
                    Back to plan
                  </button>
                </>
              ) : chickenState === "paused" || card.mode === "paused" ? (
                <button
                  type="button"
                  onPointerDown={stopDrag}
                  onClick={resumeSession}
                  className={`${buttonClass} bg-navy text-white focus-visible:outline-navy`}
                >
                  <Play size={14} aria-hidden />
                  Resume
                </button>
              ) : chickenState === "complete" ? (
                <button
                  type="button"
                  onPointerDown={stopDrag}
                  onClick={handleDone}
                  className={`${buttonClass} bg-navy text-white focus-visible:outline-navy`}
                >
                  <Check size={14} aria-hidden />
                  Done
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onPointerDown={stopDrag}
                    onClick={pauseSession}
                    className={`${buttonClass} flex-1 border border-gray-light bg-white text-navy focus-visible:outline-navy`}
                  >
                    <Pause size={14} aria-hidden />
                    Pause
                  </button>
                  <button
                    type="button"
                    onPointerDown={stopDrag}
                    onClick={handleDone}
                    className={`${buttonClass} flex-1 bg-navy text-white focus-visible:outline-navy`}
                  >
                    <Check size={14} aria-hidden />
                    Done
                  </button>
                </div>
              )}
            </div>

            {card.mode === "active_navigated" && card.activityUrl && chickenState !== "dead" && (
              <button
                type="button"
                onPointerDown={stopDrag}
                onClick={() => router.push(card.activityUrl)}
                className="mt-2 min-h-11 w-full cursor-pointer text-center text-xs font-medium text-brown-label hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
              >
                Back to task
              </button>
            )}

            <div className="mt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onPointerDown={stopDrag}
                onClick={() => setCorner(CORNERS[(CORNERS.indexOf(card.corner) + 1) % CORNERS.length])}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-[11px] text-gray-secondary hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
              >
                <Move size={12} aria-hidden />
                Move
              </button>
              <button
                type="button"
                onPointerDown={stopDrag}
                onClick={() => setMinimized(true)}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-[11px] text-gray-secondary hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
              >
                <Minimize2 size={12} aria-hidden />
                Minimize
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
