"use client";

import { useState } from "react";
import type { StudyTask } from "@/src/library/studyPlan/types";
import TaskActions from "./TaskActions";
import TaskReason from "./TaskReason";
import { SkipForward } from "lucide-react";

const statusColors: Record<string, string> = {
  recommended: "bg-gray-input",
  in_progress: "bg-gray-input ring-1 ring-brown-label",
  completed: "bg-gray-input opacity-80",
  skipped: "bg-gray-input opacity-50",
  rescheduled: "bg-gray-input opacity-50",
};

interface TaskCardProps {
  task: StudyTask & { id: string };
  onStart: () => void;
  onSkip: () => void;
  onReschedule: () => void;
  onDelete?: () => void;
  onPause?: () => void;
  onComplete?: () => void;
}

export default function TaskCard({
  task,
  onStart,
  onSkip,
  onReschedule,
  onDelete,
  onPause,
  onComplete,
}: TaskCardProps) {
  const [reasonExpanded, setReasonExpanded] = useState(false);

  return (
    <div
      className={`overflow-hidden rounded-xl p-4 transition-colors ${statusColors[task.status] ?? "bg-gray-input"}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {task.status === "completed" ? (
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-navy text-xs text-white">
              ✓
            </div>
          ) : task.status === "skipped" ? (
            <SkipForward size={16} className="text-gray-secondary" />
          ) : (
            <div className="h-6 w-6 rounded-lg border-2 border-brown-label" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold text-navy">{task.title}</h4>
          <p className="mt-0.5 truncate text-xs text-gray-secondary">
            {task.courseCode} · {task.courseName}
          </p>
          <span className="mt-1 inline-block rounded-lg bg-accent-peach px-2 py-1 text-xs font-bold text-brown-label">
            {task.estimatedMinutes} min
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-9">
        <TaskActions
          task={task}
          onStart={onStart}
          onSkip={onSkip}
          onReschedule={onReschedule}
          onDelete={onDelete}
          onPause={onPause}
          onComplete={onComplete}
        />
      </div>

      {task.source === "recommended" && (
        <div className="mt-2 pl-11">
          <TaskReason
            reason={task.reason}
            expanded={reasonExpanded}
            onToggle={() => setReasonExpanded(!reasonExpanded)}
          />
        </div>
      )}
    </div>
  );
}
