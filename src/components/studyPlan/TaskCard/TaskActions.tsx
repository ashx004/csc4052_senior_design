"use client";

import type { StudyTask } from "@/src/library/studyPlan/types";
import {
  Play,
  Pause,
  Check,
  SkipForward,
  CalendarClock,
  Trash2,
} from "lucide-react";

interface TaskActionsProps {
  task: StudyTask & { id: string };
  onStart: () => void;
  onSkip: () => void;
  onReschedule: () => void;
  onDelete?: () => void;
  onPause?: () => void;
  onComplete?: () => void;
}

export default function TaskActions({
  task,
  onStart,
  onSkip,
  onReschedule,
  onDelete,
  onPause,
  onComplete,
}: TaskActionsProps) {
  if (task.status === "completed" || task.status === "skipped") return null;

  const canReschedule = task.rescheduleCount < 3;

  return (
    <div className="flex items-center gap-1.5">
      {task.status === "recommended" && (
        <button
          onClick={onStart}
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover"
        >
          <Play size={12} /> Start
        </button>
      )}

      {task.status === "in_progress" && onPause && (
        <button
          onClick={onPause}
          className="flex items-center gap-1 rounded-md bg-bg-main px-3 py-1.5 text-xs font-medium text-text-main ring-1 ring-border-light hover:bg-bg-main/80"
        >
          <Pause size={12} /> Pause
        </button>
      )}

      {task.status === "in_progress" && onComplete && (
        <button
          onClick={onComplete}
          className="flex items-center gap-1 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600"
        >
          <Check size={12} /> Done
        </button>
      )}

      <button
        onClick={onSkip}
        className="rounded-md p-1.5 text-text-muted hover:bg-bg-main hover:text-text-main"
        title="Skip"
      >
        <SkipForward size={14} />
      </button>

      {canReschedule && (
        <button
          onClick={onReschedule}
          className="rounded-md p-1.5 text-text-muted hover:bg-bg-main hover:text-text-main"
          title="Reschedule"
        >
          <CalendarClock size={14} />
        </button>
      )}

      {task.source === "manual" && onDelete && (
        <button
          onClick={onDelete}
          className="rounded-md p-1.5 text-text-muted hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}
