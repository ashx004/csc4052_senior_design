"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useStudyPlanContext } from "@/src/context/StudyPlanContext";
import {
  focusMachineReducer,
  initialFocusState,
  type OverlayPhase,
} from "@/src/library/studyPlan/focusMachine";
import type { ChickenState, FocusCardState } from "@/src/library/studyPlan/types";

export function useFocusMachine() {
  const {
    focusCard,
    completeSession,
    abandonSession,
    updateTaskStatus,
  } = useStudyPlanContext();

  const [state, dispatch] = useReducer(focusMachineReducer, initialFocusState);
  const [snapshot, setSnapshot] = useState<FocusCardState | null>(null);
  const completedForSessionRef = useRef<string | null>(null);
  const abandonedForSessionRef = useRef<string | null>(null);
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
      abandonedForSessionRef.current = null;
      dispatch({ type: "RESET" });
    }
    if (!id) sessionIdRef.current = null;
  }, [focusCard?.sessionId]);

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
          if (!sessionWritten) return;
        }
        dispatch({ type: "COMPLETE" });
      })();
    }
  }, [state.overlay, focusCard, completeSession, updateTaskStatus]);

  // Break countdown lives here (single interval, driven by the reducer).
  useEffect(() => {
    if (state.overlay !== "break") return;
    const t = window.setInterval(() => dispatch({ type: "BREAK_TICK" }), 1000);
    return () => window.clearInterval(t);
  }, [state.overlay]);

  // Death on tab-away > 60s (single visibility handler; abandon once).
  useEffect(() => {
    if (!focusCard?.visible || focusCard.mode === "paused" || state.overlay !== "none")
      return;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else if (hiddenAtRef.current) {
        const away = Date.now() - hiddenAtRef.current;
        hiddenAtRef.current = null;
        if (away > 60_000) {
          const taskId = focusCard.taskId;
          const sessionId = focusCard.sessionId;
          if (abandonedForSessionRef.current === sessionId) return;
          abandonedForSessionRef.current = sessionId;
          void (async () => {
            let sessionWritten = false;
            try {
              await abandonSession();
              sessionWritten = true;
              if (taskId) await updateTaskStatus(taskId, "recommended");
            } catch {
              if (!sessionWritten && abandonedForSessionRef.current === sessionId) {
                abandonedForSessionRef.current = null;
              }
              if (!sessionWritten) return;
            }
            dispatch({ type: "ABANDON" });
          })();
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [focusCard?.visible, focusCard?.mode, focusCard?.sessionId, focusCard?.taskId, state.overlay, abandonSession, updateTaskStatus]);

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
        if (!sessionWritten) return;
      }
      dispatch({ type: "COMPLETE" });
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
