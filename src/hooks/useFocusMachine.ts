"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useStudyPlanContext } from "@/src/context/StudyPlanContext";
import {
  focusMachineReducer,
  initialFocusState,
  shouldOpenDoneChoice,
  type OverlayPhase,
} from "@/src/library/studyPlan/focusMachine";
import type { ChickenState, FocusCardState } from "@/src/library/studyPlan/types";

/** Pause (not kill) the session only after the tab has been hidden this long,
 *  so quick tab-switches while studying don't interrupt the run. */
const AWAY_PAUSE_MS = 5 * 60 * 1000;

export function useFocusMachine() {
  const {
    focusCard,
    completedSessionId,
    completeSession,
    pauseSession,
    updateTaskStatus,
  } = useStudyPlanContext();

  const [state, dispatch] = useReducer(focusMachineReducer, initialFocusState);
  const [snapshot, setSnapshot] = useState<FocusCardState | null>(null);
  const completedForSessionRef = useRef<string | null>(null);
  const doneShownForSessionRef = useRef<string | null>(null);
  const pausedForSessionRef = useRef<string | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  if (focusCard && focusCard !== snapshot) {
    setSnapshot(focusCard);
  }
  const card = focusCard ?? snapshot;

  // Reset the overlay whenever a NEW session id appears (one-way, no toggling).
  useEffect(() => {
    const id = focusCard?.sessionId ?? null;
    if (id && id !== sessionIdRef.current) {
      sessionIdRef.current = id;
      completedForSessionRef.current = null;
      doneShownForSessionRef.current = null;
      pausedForSessionRef.current = null;
      dispatch({ type: "RESET" });
    }
    if (!id) sessionIdRef.current = null;
  }, [focusCard?.sessionId]);

  // When the tracked session completes (Done button, quiz submit, reading
  // finished), open the "done" choice instead of letting the card vanish.
  // Driven by the completion signal, which is set before the session leaves the
  // active query, so the overlay is up before focusCard goes null — no flicker.
  useEffect(() => {
    const trackedSessionId = card?.sessionId ?? null;
    if (
      shouldOpenDoneChoice({
        completedSessionId,
        trackedSessionId,
        overlay: state.overlay,
        alreadyShownSessionId: doneShownForSessionRef.current,
      })
    ) {
      doneShownForSessionRef.current = completedSessionId;
      dispatch({ type: "COMPLETE" });
    }
  }, [completedSessionId, card?.sessionId, state.overlay]);

  // Auto-complete exactly once when progress hits 100% while active.
  useEffect(() => {
    if (
      state.overlay === "none" &&
      focusCard?.visible &&
      focusCard.mode !== "paused" &&
      focusCard.progress >= 1 &&
      completedForSessionRef.current !== focusCard.sessionId
    ) {
      const sessionId = focusCard.sessionId;
      const taskId = focusCard.taskId;
      completedForSessionRef.current = sessionId;
      void (async () => {
        let sessionWritten = false;
        try {
          await completeSession();
          sessionWritten = true;
          if (taskId) await updateTaskStatus(taskId, "completed");
        } catch {
          if (!sessionWritten && completedForSessionRef.current === sessionId) {
            completedForSessionRef.current = null;
          }
        }
        // The done overlay is opened by the completion-signal effect above,
        // not here, so every completion path opens it exactly once.
      })();
    }
  }, [state.overlay, focusCard, completeSession, updateTaskStatus]);

  // Break countdown lives here (single interval, driven by the reducer).
  useEffect(() => {
    if (state.overlay !== "break") return;
    const t = window.setInterval(() => dispatch({ type: "BREAK_TICK" }), 1000);
    return () => window.clearInterval(t);
  }, [state.overlay]);

  // Auto-pause on tab-away > 60s (single visibility handler; pause once).
  // The chicken no longer dies — the session pauses at the moment the user left
  // (away time is not counted) and can be resumed exactly where it stopped.
  useEffect(() => {
    if (!focusCard?.visible || focusCard.mode === "paused" || state.overlay !== "none")
      return;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else if (hiddenAtRef.current) {
        const leftAtMs = hiddenAtRef.current;
        const away = Date.now() - leftAtMs;
        hiddenAtRef.current = null;
        if (away > AWAY_PAUSE_MS) {
          const sessionId = focusCard.sessionId;
          if (pausedForSessionRef.current === sessionId) return;
          pausedForSessionRef.current = sessionId;
          void (async () => {
            try {
              await pauseSession(leftAtMs);
            } catch {
              if (pausedForSessionRef.current === sessionId) {
                pausedForSessionRef.current = null;
              }
            }
          })();
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [focusCard?.visible, focusCard?.mode, focusCard?.sessionId, state.overlay, pauseSession]);

  const done = useCallback(() => {
    if (!focusCard?.visible) {
      dispatch({ type: "COMPLETE" });
      return;
    }
    if (completedForSessionRef.current === focusCard.sessionId) return;
    const sessionId = focusCard.sessionId;
    const taskId = focusCard.taskId;
    completedForSessionRef.current = sessionId;
    void (async () => {
      let sessionWritten = false;
      try {
        await completeSession();
        sessionWritten = true;
        if (taskId) await updateTaskStatus(taskId, "completed");
      } catch {
        if (!sessionWritten && completedForSessionRef.current === sessionId) {
          completedForSessionRef.current = null;
        }
      }
      // The done overlay opens via the completion-signal effect, not here.
    })();
  }, [focusCard, completeSession, updateTaskStatus]);

  const chooseBreak = useCallback(() => dispatch({ type: "CHOOSE_BREAK" }), []);
  const chooseFinish = useCallback(() => dispatch({ type: "CHOOSE_FINISH" }), []);
  const skipBreak = useCallback(() => dispatch({ type: "BREAK_END" }), []);
  const backToLearning = useCallback(() => dispatch({ type: "BACK_TO_LEARNING" }), []);
  const restart = useCallback(() => dispatch({ type: "RESET" }), []);

  // Visible chicken state: overlay wins, else session-derived.
  const chickenState: ChickenState =
    state.overlay === "dead"
      ? "dead"
      : state.overlay === "done_choice"
        ? "complete"
        : state.overlay === "break"
          ? "break"
          : state.overlay === "back_prompt"
            ? "complete"
            : (card?.chickenState ?? "egg");

  const displaySeconds =
    state.overlay === "break"
      ? state.breakSecondsLeft
      : card
        ? card.timerMode === "countdown" && card.targetSeconds
          ? Math.max(0, card.targetSeconds - card.elapsedSeconds)
          : card.elapsedSeconds
        : 0;

  const visible = Boolean(focusCard?.visible || state.overlay !== "none");

  return {
    visible,
    overlay: state.overlay as OverlayPhase,
    chickenState,
    displaySeconds,
    breakSecondsLeft: state.breakSecondsLeft,
    card,
    actions: { done, chooseBreak, chooseFinish, skipBreak, backToLearning, restart },
  };
}
