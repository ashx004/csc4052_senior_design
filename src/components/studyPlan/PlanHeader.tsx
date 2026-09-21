"use client";

import { Plus, Sparkles } from "lucide-react";
import type { DailyPlan } from "@/src/library/studyPlan/types";

interface PlanHeaderProps {
  plan: DailyPlan;
  remainingMinutes: number;
  canStartNext: boolean;
  completedCount: number;
  totalActiveTasks: number;
  onAddTask: () => void;
  onSuggestTasks: () => void;
  onStartNextTask: () => void;
  onClearPlan: () => void;
}

export default function PlanHeader({
  plan,
  remainingMinutes,
  canStartNext,
  completedCount,
  totalActiveTasks,
  onAddTask,
  onSuggestTasks,
  onStartNextTask,
  onClearPlan,
}: PlanHeaderProps) {
  const progress =
    totalActiveTasks > 0
      ? Math.round((completedCount / totalActiveTasks) * 100)
      : 0;

  return (
    <div>
      {/* Title row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brown-label">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-[-0.05em] text-navy">
            Today's study plan
          </h2>
          <p className="mt-1 text-sm text-gray-secondary">
            Prioritized around your weak topics, deadlines, and available time.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onAddTask}
            className="rounded-[10px] border border-brown-label px-4 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-beige-canvas"
          >
            <Plus size={14} className="-mt-0.5 mr-1 inline" />
            Add task
          </button>
          <button
            onClick={onSuggestTasks}
            className="rounded-[10px] border border-brown-label px-4 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-beige-canvas"
          >
            <Sparkles size={14} className="-mt-0.5 mr-1 inline" />
            Get suggestions
          </button>
          <button
            onClick={onStartNextTask}
            disabled={!canStartNext}
            className="rounded-[10px] bg-navy px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:opacity-50"
          >
            Start next task
          </button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-beige-light p-4">
          <span className="text-2xl font-bold tabular-nums text-navy">
            {progress}%
          </span>
          <span className="mt-1 block text-xs text-gray-secondary">
            daily progress
          </span>
        </div>
        <div className="rounded-2xl bg-beige-light p-4">
          <span className="text-2xl font-bold tabular-nums text-navy">
            {remainingMinutes} min
          </span>
          <span className="mt-1 block text-xs text-gray-secondary">
            remaining focus time
          </span>
        </div>
        <div className="rounded-2xl bg-beige-light p-4">
          <span className="text-2xl font-bold tabular-nums text-navy">
            {completedCount} / {totalActiveTasks}
          </span>
          <span className="mt-1 block text-xs text-gray-secondary">
            tasks completed
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-gray-input">
        <div
          className="h-full rounded-full bg-brown-label transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-gray-secondary">
        <span>
          {completedCount} of {totalActiveTasks} tasks complete
        </span>
        <button
          onClick={onClearPlan}
          className="text-gray-secondary transition-colors hover:text-navy"
        >
          Clear plan
        </button>
      </div>
    </div>
  );
}
