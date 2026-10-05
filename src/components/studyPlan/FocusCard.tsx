"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { Check, Minimize2, Pause, Play } from "lucide-react";
import { useStudyPlanContext } from "@/src/context/StudyPlanContext";
import { useFocusMachine } from "@/src/hooks/useFocusMachine";
import { cornerFrame, cornerZoneAt, resolveDropCorner } from "@/src/library/studyPlan/focusCardDrag";
import { formatElapsedTime } from "@/src/library/studyPlan/sessionTimer";
import {
  EXPANDED_STATE_HINTS,
  EXPANDED_STATE_MESSAGES,
  STATE_BADGES,
  STATE_COLORS,
  WIDGET_STATE_CONFIG,
} from "@/src/library/studyPlan/chickenConfig";
import ChickenAvatar from "./ChickenAvatar";
import type { CardCorner } from "@/src/library/studyPlan/types";

// Drop-zone tint while dragging. Fixed gray so it doesn't change with the chicken state.
const DROP_ZONE_COLOR = "#E7E5E4";

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
    pauseSession,
    resumeSession,
    setMinimized,
    setCorner,
  } = useStudyPlanContext();
  const {
    visible,
    overlay,
    chickenState,
    displaySeconds,
    card,
    actions,
  } = useFocusMachine();

  const constraintsRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cardResizeObserverRef = useRef<ResizeObserver | null>(null);
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const suppressClickUntilRef = useRef(0);

  const [cardSize, setCardSize] = useState({ width: 240, height: 180 });
  const [dragging, setDragging] = useState(false);
  const [activeZone, setActiveZone] = useState<CardCorner | null>(null);

  // Presence is decided by tab visibility (see useFocusMachine's auto-pause),
  // not mouse movement: a still mouse while reading a PDF still means "here".

  useEffect(() => {
    if (visible) return;
    dragX.set(0);
    dragY.set(0);
    setDragging(false);
    setActiveZone(null);
  }, [visible, dragX, dragY]);

  const setCardNode = useCallback((node: HTMLDivElement | null) => {
    cardResizeObserverRef.current?.disconnect();
    cardResizeObserverRef.current = null;
    cardRef.current = node;

    if (!node) return;

    const measure = () => {
      setCardSize({ width: node.offsetWidth, height: node.offsetHeight });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    cardResizeObserverRef.current = observer;
  }, []);

  const handleDragStart = () => {
    setDragging(true);
  };

  const handleDrag = (
    _: unknown,
    info: { point: { x: number; y: number } }
  ) => {
    const viewportPoint = {
      x: info.point.x - window.scrollX,
      y: info.point.y - window.scrollY,
    };
    setActiveZone(
      cornerZoneAt(viewportPoint.x, viewportPoint.y, {
        width: window.innerWidth,
        height: window.innerHeight,
      })
    );
  };

  const handleDragEnd = useCallback(
    (_: unknown, info: { point: { x: number; y: number }; offset: { x: number; y: number } }) => {
      if (!card) {
        dragX.set(0);
        dragY.set(0);
        setDragging(false);
        setActiveZone(null);
        return;
      }
      const moved = Math.abs(info.offset.x) > 6 || Math.abs(info.offset.y) > 6;
      const viewportPoint = {
        x: info.point.x - window.scrollX,
        y: info.point.y - window.scrollY,
      };
      const next = moved
        ? resolveDropCorner(
            viewportPoint,
            { width: window.innerWidth, height: window.innerHeight },
            card.corner
          )
        : card.corner;
      if (moved) suppressClickUntilRef.current = Date.now() + 300;
      const el = cardRef.current;
      if (el) {
        const frame = cornerFrame(next, {
          width: el.offsetWidth,
          height: el.offsetHeight,
        });
        el.style.top = frame.top;
        el.style.left = frame.left;
      }
      dragX.set(0);
      dragY.set(0);
      setDragging(false);
      setActiveZone(null);
      if (next !== card.corner) setCorner(next);
    },
    [card, dragX, dragY, setCorner]
  );

  if (!visible || !card) return null;

  const displayTime =
    chickenState === "dead"
      ? "Gave up"
      : chickenState === "complete"
        ? overlay === "break"
          ? formatClock(displaySeconds)
          : "Done"
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
  const pop = { type: "spring" as const, stiffness: 300, damping: 30 };
  const transition = reduceMotion ? { duration: 0 } : { opacity: pop, scale: pop };

  const widgetActionLabel =
    overlay === "done_choice" || overlay === "back_prompt"
      ? "Expand"
      : overlay === "break"
        ? "Skip"
        : chickenState === "dead"
          ? "Restart"
          : card.mode === "paused"
            ? "Resume"
            : "Pause";

  const handleWidgetAction = () => {
    if (overlay === "done_choice" || overlay === "back_prompt") setMinimized(false);
    else if (overlay === "break") actions.skipBreak();
    else if (chickenState === "dead") {
      actions.restart();
      router.push("/learning");
    } else if (card.mode === "paused") resumeSession();
    else pauseSession();
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

      {dragging && (
        <>
          <div
            className="pointer-events-none fixed inset-0 z-[55] backdrop-blur-sm"
            aria-hidden
          />
          {CORNERS.map((corner) => (
            <div
              key={corner}
              aria-hidden
              className={`pointer-events-none fixed z-[56] border-0 ${
                card.isMinimized ? "rounded-2xl" : "rounded-[20px]"
              }`}
              style={{
                ...cornerFrame(corner, cardSize),
                width: cardSize.width,
                height: cardSize.height,
                backgroundColor: DROP_ZONE_COLOR,
                opacity: activeZone === corner ? 0.5 : 0.22,
              }}
            />
          ))}
        </>
      )}

      <AnimatePresence mode="wait">
        {card.isMinimized ? (
          <motion.div
            key="minimized"
            ref={setCardNode}
            drag
            dragConstraints={constraintsRef}
            dragElastic={0}
            dragMomentum={false}
            onDragStart={handleDragStart}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96 }}
            transition={transition}
            role="region"
            aria-label={`${statusMessage} ${chickenState === "dead" || chickenState === "complete" ? displayTime : formatElapsedTime(displaySeconds)}`}
            tabIndex={0}
            onKeyDown={onCardKeyDown}
            className="fixed z-[60] flex w-[min(340px,calc(100vw-24px))] cursor-grab select-none items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-[0_8px_30px_rgba(26,26,48,0.14)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy active:cursor-grabbing"
            style={{
              x: dragX,
              y: dragY,
              ...cornerFrame(card.corner, cardSize),
              touchAction: "none",
            }}
            onClick={(event) => {
              if (Date.now() < suppressClickUntilRef.current) return;
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
              {widgetActionLabel}
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            ref={setCardNode}
            drag
            dragConstraints={constraintsRef}
            dragElastic={0}
            dragMomentum={false}
            onDragStart={handleDragStart}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96 }}
            transition={transition}
            role="region"
            aria-label={`${statusMessage}. ${displayTime}`}
            tabIndex={0}
            onKeyDown={onCardKeyDown}
            className="fixed z-[60] w-[min(240px,calc(100vw-24px))] cursor-grab select-none rounded-[20px] bg-white p-4 shadow-[0_8px_30px_rgba(26,26,48,0.14)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy active:cursor-grabbing"
            style={{
              x: dragX,
              y: dragY,
              ...cornerFrame(card.corner, cardSize),
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
              {overlay === "done_choice" ? (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onPointerDown={stopDrag}
                    onClick={actions.chooseBreak}
                    className={`${buttonClass} border border-gray-light bg-white text-navy focus-visible:outline-navy`}
                  >
                    Take a 5-min break
                  </button>
                  <button
                    type="button"
                    onPointerDown={stopDrag}
                    onClick={actions.chooseFinish}
                    className={`${buttonClass} bg-navy text-white focus-visible:outline-navy`}
                  >
                    <Check size={14} aria-hidden />
                    Finish
                  </button>
                </div>
              ) : overlay === "break" ? (
                <button
                  type="button"
                  onPointerDown={stopDrag}
                  onClick={actions.skipBreak}
                  className={`${buttonClass} border border-gray-light bg-white text-navy focus-visible:outline-navy`}
                >
                  Skip break
                </button>
              ) : overlay === "back_prompt" ? (
                <button
                  type="button"
                  onPointerDown={stopDrag}
                  onClick={() => {
                    actions.backToLearning();
                    router.push("/learning");
                  }}
                  className={`${buttonClass} bg-navy text-white focus-visible:outline-navy`}
                >
                  Back to learning
                </button>
              ) : chickenState === "dead" ? (
                <>
                  <button
                    type="button"
                    onPointerDown={stopDrag}
                    onClick={() => {
                      actions.restart();
                      router.push("/learning");
                    }}
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
              ) : card.mode === "paused" ? (
                <button
                  type="button"
                  onPointerDown={stopDrag}
                  onClick={resumeSession}
                  className={`${buttonClass} bg-navy text-white focus-visible:outline-navy`}
                >
                  <Play size={14} aria-hidden />
                  Resume
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onPointerDown={stopDrag}
                    onClick={() => pauseSession()}
                    className={`${buttonClass} flex-1 border border-gray-light bg-white text-navy focus-visible:outline-navy`}
                  >
                    <Pause size={14} aria-hidden />
                    Pause
                  </button>
                  <button
                    type="button"
                    onPointerDown={stopDrag}
                    onClick={actions.done}
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

            {overlay === "done_choice" ? (
              <button
                type="button"
                onPointerDown={stopDrag}
                onClick={() => {
                  actions.chooseFinish();
                  router.push("/learning");
                }}
                className="mt-2 min-h-11 w-full cursor-pointer text-center text-xs font-medium text-brown-label hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
              >
                Back to learning
              </button>
            ) : overlay === "none" ? (
              <div className="mt-2 flex items-center justify-center gap-3">
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
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
