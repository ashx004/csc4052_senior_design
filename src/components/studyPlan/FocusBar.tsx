"use client";

import { useRouter } from "next/navigation";
import { useStudyPlanContext } from "@/src/context/StudyPlanContext";
import { formatElapsedTime } from "@/src/library/studyPlan/sessionTimer";
import { Pause, Play, Check, ArrowLeft } from "lucide-react";

export default function FocusBar() {
  const router = useRouter();
  const {
    focusBar,
    pauseSession,
    resumeSession,
    completeSession,
    updateTaskStatus,
  } = useStudyPlanContext();

  if (!focusBar || !focusBar.visible) return null;

  const handleDone = async () => {
    await completeSession();
    await updateTaskStatus(focusBar.taskId, "completed");
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex h-12 items-center justify-between bg-[#1A1A30] px-4 text-sm text-white shadow-md transition-transform">
      <div className="flex items-center gap-3">
        <span className="font-medium">{focusBar.taskTitle}</span>
        <span className="text-white/60">{focusBar.courseCode}</span>
      </div>

      <div className="flex items-center gap-3">
        {focusBar.mode === "paused" ? (
          <>
            <span className="text-white/60">
              Paused · {formatElapsedTime(focusBar.elapsedSeconds)} studied
            </span>
            <button
              onClick={resumeSession}
              className="flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-xs font-medium hover:bg-white/25"
            >
              <Play size={14} />
              <span className="hidden sm:inline">Resume</span>
            </button>
          </>
        ) : (
          <>
            <span className="tabular-nums text-white/80">
              {formatElapsedTime(focusBar.elapsedSeconds)}
            </span>

            {focusBar.mode === "active_navigated" && (
              <button
                onClick={() => router.push(focusBar.activityUrl)}
                className="flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-xs font-medium hover:bg-white/25"
              >
                <ArrowLeft size={14} />
                <span className="hidden sm:inline">Back to task</span>
              </button>
            )}

            <button
              onClick={pauseSession}
              className="flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-xs font-medium hover:bg-white/25"
            >
              <Pause size={14} />
              <span className="hidden sm:inline">Pause</span>
            </button>

            <button
              onClick={handleDone}
              className="flex items-center gap-1.5 rounded-md bg-emerald-500/80 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500"
            >
              <Check size={14} />
              <span className="hidden sm:inline">Done</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
