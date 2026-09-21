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
    <div className="flex flex-wrap items-center gap-1.5">
      {task.status === "recommended" && (
        <button
          onClick={onStart}
          className="flex items-center gap-1 rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          <Play size={12} /> Start
        </button>
      )}

      {task.status === "in_progress" && onPause && (
        <button
          onClick={onPause}
          className="flex items-center gap-1 rounded-lg bg-gray-input px-3 py-1.5 text-xs font-semibold text-navy ring-1 ring-gray-light hover:bg-white"
        >
          <Pause size={12} /> Pause
        </button>
      )}

      {task.status === "in_progress" && onComplete && (
        <button
          onClick={onComplete}
          className="flex items-center gap-1 rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          <Check size={12} /> Done
        </button>
      )}

      <button
        onClick={onSkip}
        className="rounded-lg p-1.5 text-gray-secondary hover:bg-gray-input hover:text-navy"
        title="Skip"
      >
        <SkipForward size={14} />
      </button>

      {canReschedule && (
        <button
          onClick={onReschedule}
          className="rounded-lg p-1.5 text-gray-secondary hover:bg-gray-input hover:text-navy"
          title="Reschedule"
        >
          <CalendarClock size={14} />
        </button>
      )}

      {task.source === "manual" && onDelete && (
        <button
          onClick={onDelete}
          className="rounded-lg p-1.5 text-gray-secondary hover:bg-accent-peach hover:text-navy"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}
