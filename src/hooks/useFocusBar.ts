"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import type {
  StudySession,
  FocusBarState,
  FocusBarMode,
} from "@/src/library/studyPlan/types";

export function useFocusBar(
  session: (StudySession & { id: string }) | null,
  taskTitle: string,
  courseCode: string,
  elapsedSeconds: number
): FocusBarState | null {
  const pathname = usePathname();

  return useMemo(() => {
    if (!session || (session.status !== "active" && session.status !== "paused")) {
      return null;
    }

    let mode: FocusBarMode;
    if (session.status === "paused") {
      mode = "paused";
    } else if (pathname === session.activityUrl || pathname.startsWith(session.activityUrl.split("?")[0])) {
      mode = "active_on_task";
    } else {
      mode = "active_navigated";
    }

    return {
      visible: true,
      mode,
      taskId: session.taskId,
      taskTitle,
      courseCode,
      elapsedSeconds,
      sessionId: session.id,
      activityUrl: session.activityUrl,
    };
  }, [session, taskTitle, courseCode, elapsedSeconds, pathname]);
}
