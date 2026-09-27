"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import type {
  StudySession,
  FocusCardState,
  FocusCardMode,
  CardCorner,
} from "@/src/library/studyPlan/types";
import { getChickenStateFromProgress } from "@/src/library/studyPlan/chickenConfig";

const LS_CORNER_KEY = "focus-card-corner";
const LS_MINIMIZED_KEY = "focus-card-minimized";

function readCorner(): CardCorner {
  try {
    const v = localStorage.getItem(LS_CORNER_KEY);
    if (
      v === "top-left" ||
      v === "top-right" ||
      v === "bottom-left" ||
      v === "bottom-right"
    )
      return v;
  } catch {
    /* storage unavailable */
  }
  return "bottom-right";
}

function readMinimized(): boolean {
  try {
    return localStorage.getItem(LS_MINIMIZED_KEY) === "true";
  } catch {
    /* storage unavailable */
  }
  return false;
}

export function useFocusCard(
  session: (StudySession & { id: string }) | null,
  taskTitle: string,
  courseCode: string,
  elapsedSeconds: number
): {
  focusCard: FocusCardState | null;
  setMinimized: (v: boolean) => void;
  setCorner: (c: CardCorner) => void;
} {
  const pathname = usePathname();
  const [corner, setCornerRaw] = useState<CardCorner>("bottom-right");
  const [isMinimized, setMinimizedRaw] = useState(false);

  useEffect(() => {
    setCornerRaw(readCorner());
    setMinimizedRaw(readMinimized());
  }, []);

  const setCorner = useCallback((c: CardCorner) => {
    setCornerRaw(c);
    try {
      localStorage.setItem(LS_CORNER_KEY, c);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const setMinimized = useCallback((v: boolean) => {
    setMinimizedRaw(v);
    try {
      localStorage.setItem(LS_MINIMIZED_KEY, String(v));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const focusCard = useMemo<FocusCardState | null>(() => {
    if (
      !session ||
      (session.status !== "active" && session.status !== "paused")
    ) {
      return null;
    }

    let mode: FocusCardMode;
    if (session.status === "paused") {
      mode = "paused";
    } else if (
      pathname === session.activityUrl ||
      pathname.startsWith(session.activityUrl.split("?")[0])
    ) {
      mode = "active_on_task";
    } else {
      mode = "active_navigated";
    }

    const timerMode = session.timerMode ?? "countup";
    const targetSeconds = session.targetSeconds ?? null;

    let progress: number;
    if (timerMode === "countdown" && targetSeconds && targetSeconds > 0) {
      progress = Math.min(elapsedSeconds / targetSeconds, 1.0);
    } else {
      const recommendedSeconds = targetSeconds ?? 1500;
      progress = Math.min(elapsedSeconds / recommendedSeconds, 1.0);
    }

    const chickenState = getChickenStateFromProgress(progress, session.status);

    return {
      visible: true,
      mode,
      taskId: session.taskId,
      taskTitle,
      courseCode,
      elapsedSeconds,
      sessionId: session.id,
      activityUrl: session.activityUrl,
      chickenState,
      isMinimized,
      corner,
      timerMode,
      targetSeconds,
      progress,
    };
  }, [
    session,
    taskTitle,
    courseCode,
    elapsedSeconds,
    pathname,
    isMinimized,
    corner,
  ]);

  return { focusCard, setMinimized, setCorner };
}
