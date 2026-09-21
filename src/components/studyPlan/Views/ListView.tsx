"use client";

import type { StudyTask } from "@/src/library/studyPlan/types";
import {
  Check,
  Pause,
  Play,
  Plus,
  SkipForward,
  CalendarClock,
  Trash2,
} from "lucide-react";

interface ListViewProps {
  tasks: (StudyTask & { id: string })[];
  onStart: (taskId: string) => void;
  onSkip: (taskId: string) => void;
  onReschedule: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onPause: () => void;
  onComplete: (taskId: string) => void;
  onAddTask: () => void;
}

const statusOrder: Record<StudyTask["status"], number> = {
  in_progress: 0,
  recommended: 1,
  completed: 2,
  skipped: 3,
  rescheduled: 4,
};

function formatCompletedAt(task: StudyTask): string | null {
  const raw = task.completedAt;
  if (!raw) return null;
  const date =
    typeof raw.toDate === "function" ? raw.toDate() : new Date(String(raw));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function subtitleFor(task: StudyTask): string {
  const parts = [task.courseName || task.courseCode];
  if (task.status === "completed") {
    const time = formatCompletedAt(task);
    parts.push(time ? `completed ${time}` : "completed");
  } else if (task.status === "skipped") {
    parts.push("skipped");
  } else if (task.status === "rescheduled") {
    parts.push("rescheduled");
  } else if (task.reason) {
    parts.push(task.reason);
  }
  return parts.filter(Boolean).join(" · ");
}

export default function ListView({
  tasks,
  onStart,
  onSkip,
  onReschedule,
  onDelete,
  onPause,
  onComplete,
  onAddTask,
}: ListViewProps) {
  const sorted = [...tasks].sort(
    (a, b) => (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5)
  );

  return (
    <section className="rounded-[19px] bg-beige-light p-5">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-base font-semibold text-navy">Focus queue</h4>
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brown-label">
          {sorted.length} {sorted.length === 1 ? "task" : "tasks"}
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-secondary">
          Nothing in the queue yet. Add a task to get started.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-light">
          {sorted.map((task) => {
            const isDone = task.status === "completed";
            const isClosed = isDone || task.status === "skipped";
            const isActive = task.status === "in_progress";

            return (
              <li
                key={task.id}
                className="group flex flex-wrap items-center gap-x-3 gap-y-2 py-4"
              >
                {isClosed ? (
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-lg border ${
                      isDone
                        ? "border-navy bg-navy text-white"
                        : "border-gray-light bg-gray-input"
                    }`}
                  >
                    {isDone && <Check size={11} strokeWidth={3} />}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onComplete(task.id)}
                    aria-label={`Mark ${task.title} as complete`}
                    className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-lg border border-brown-label bg-transparent text-transparent transition-colors hover:border-navy hover:text-navy/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                  >
                    <Check size={11} strokeWidth={3} aria-hidden="true" />
                  </button>
                )}

                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-semibold ${
                      isClosed ? "text-gray-secondary" : "text-navy"
                    }`}
                  >
                    {task.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-gray-secondary">
                    {subtitleFor(task)}
                  </p>
                </div>

                {isDone ? (
                  <span className="flex-shrink-0 rounded-full bg-accent-peach px-2.5 py-1 text-xs font-medium text-brown-label">
                    Done
                  </span>
                ) : (
                  <span className="flex-shrink-0 text-xs font-medium tabular-nums text-brown-label">
                    {task.status === "skipped"
                      ? "Skipped"
                      : `${task.estimatedMinutes} min`}
                  </span>
                )}

                {!isClosed && (
                  <div className="flex flex-shrink-0 items-center gap-1 opacity-100 transition-opacity lg:opacity-0 lg:focus-within:opacity-100 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                    {isActive ? (
                      <button
                        type="button"
                        onClick={onPause}
                        aria-label={`Pause ${task.title}`}
                        className="rounded-full p-1.5 text-gray-secondary transition-colors hover:bg-beige-light hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                      >
                        <Pause size={14} aria-hidden="true" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onStart(task.id)}
                        aria-label={`Start ${task.title}`}
                        className="rounded-full p-1.5 text-gray-secondary transition-colors hover:bg-beige-light hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                      >
                        <Play size={14} aria-hidden="true" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onSkip(task.id)}
                      aria-label={`Skip ${task.title}`}
                      className="rounded-full p-1.5 text-gray-secondary transition-colors hover:bg-beige-light hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                    >
                      <SkipForward size={14} aria-hidden="true" />
                    </button>

                    {task.rescheduleCount < 3 && (
                      <button
                        type="button"
                        onClick={() => onReschedule(task.id)}
                        aria-label={`Reschedule ${task.title}`}
                        className="rounded-full p-1.5 text-gray-secondary transition-colors hover:bg-beige-light hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                      >
                        <CalendarClock size={14} aria-hidden="true" />
                      </button>
                    )}

                    {task.source === "manual" && (
                      <button
                        type="button"
                        onClick={() => onDelete(task.id)}
                        aria-label={`Delete ${task.title}`}
                        className="rounded-full p-1.5 text-gray-secondary transition-colors hover:bg-alert-error-bg hover:text-alert-error focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alert-error"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={onAddTask}
        className="mt-2 flex w-full items-center justify-center gap-1.5 border-t border-gray-light pt-4 text-sm font-medium text-gray-secondary transition-colors hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
      >
        <Plus size={14} aria-hidden="true" />
        Add a personal task
      </button>
    </section>
  );
}
