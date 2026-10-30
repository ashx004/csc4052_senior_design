"use client";

import { useState } from "react";
import type { StudyTask } from "@/src/library/studyPlan/types";
import { resolveActivityTarget } from "@/src/library/studyPlan/activityTarget";
import { taskLevelBadge } from "@/src/library/studyPlan/taskLevelBadge";
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
  onContinue?: () => void;
  onSkip: () => void;
  onReschedule: () => void;
  onDelete?: () => void;
  onPause?: () => void;
  onComplete?: () => void;
  starting?: boolean;
}

const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

function formatBlockTime(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "";
  const startText = s.toLocaleTimeString("en-US", TIME_FORMAT);
  const endText = e.toLocaleTimeString("en-US", TIME_FORMAT);
  const [endClock, endMeridiem] = endText.split(/\s/);
  const [startClock, startMeridiem] = startText.split(/\s/);
  return startMeridiem === endMeridiem
    ? `${startClock}–${endClock} ${endMeridiem}`
    : `${startText}–${endText}`;
}

export default function TaskCard({
  task,
  onStart,
  onContinue,
  onSkip,
  onReschedule,
  onDelete,
  onPause,
  onComplete,
  starting,
}: TaskCardProps) {
  const [reasonExpanded, setReasonExpanded] = useState(false);
  const levelBadge = taskLevelBadge(resolveActivityTarget(task));

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
          <div className="flex min-w-0 items-center gap-2">
            <h4 className="min-w-0 truncate text-sm font-semibold text-navy">{task.title}</h4>
            {/* The same middot the metadata line below uses, so the level reads as part of the
                title rather than a stray word: "Quiz: Recursion · Review". */}
            {levelBadge && (
              <span className="shrink-0 text-xs text-gray-secondary">{`· ${levelBadge}`}</span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-secondary">
            {task.courseCode} · {task.courseName}
          </p>
          <span className="mt-1 inline-block rounded-lg bg-accent-peach px-2 py-1 text-xs font-bold text-brown-label">
            {task.estimatedMinutes} min
          </span>
          {task.scheduledStart && task.scheduledEnd && (
            <p className="mt-1 text-xs text-gray-secondary">
              {formatBlockTime(task.scheduledStart, task.scheduledEnd)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-9">
        <TaskActions
          task={task}
          onStart={onStart}
          onContinue={onContinue}
          onSkip={onSkip}
          onReschedule={onReschedule}
          onDelete={onDelete}
          onPause={onPause}
          onComplete={onComplete}
          starting={starting}
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
