"use client";

import { useState } from "react";
import type { StudyTask } from "@/src/library/studyPlan/types";
import TaskActions from "./TaskActions";
import TaskReason from "./TaskReason";
import {
  ClipboardList,
  Layers,
  BookOpen,
  MessageCircle,
  CheckCircle2,
  SkipForward,
  Clock,
} from "lucide-react";

const activityIcons = {
  quiz: ClipboardList,
  flashcards: Layers,
  reading: BookOpen,
  ai_explanation: MessageCircle,
};

const statusColors: Record<string, string> = {
  recommended: "border-border-light",
  in_progress: "border-primary bg-primary/5",
  completed: "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20",
  skipped: "border-border-light opacity-60",
  rescheduled: "border-border-light opacity-60",
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
  const Icon = activityIcons[task.activityType];

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${statusColors[task.status] ?? "border-border-light"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-bg-main p-2">
            {task.status === "completed" ? (
              <CheckCircle2 size={16} className="text-emerald-500" />
            ) : task.status === "skipped" ? (
              <SkipForward size={16} className="text-text-muted" />
            ) : (
              <Icon size={16} className="text-primary" />
            )}
          </div>

          <div>
            <h4 className="text-sm font-medium text-text-main">{task.title}</h4>
            <p className="mt-0.5 text-xs text-text-muted">
              {task.courseCode} · {task.courseName}
            </p>
            <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
              <Clock size={12} />
              <span>{task.estimatedMinutes} min</span>
            </div>
          </div>
        </div>

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
