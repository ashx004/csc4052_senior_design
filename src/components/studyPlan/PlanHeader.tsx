"use client";

import { Plus } from "lucide-react";
import type { DailyPlan } from "@/src/library/studyPlan/types";

interface PlanHeaderProps {
  plan: DailyPlan;
  remainingMinutes: number;
  canStartNext: boolean;
  onAddTask: () => void;
  onStartNextTask: () => void;
  onClearPlan: () => void;
}

function formatPlanDate(): string {
  return new Date()
    .toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
    .replace(",", " ·")
    .toUpperCase();
}

export default function PlanHeader({
  plan,
  remainingMinutes,
  canStartNext,
  onAddTask,
  onStartNextTask,
  onClearPlan,
}: PlanHeaderProps) {
  const progress =
    plan.totalTasks > 0
      ? Math.round((plan.completedCount / plan.totalTasks) * 100)
      : 0;

  const stats = [
    { value: `${progress}%`, label: "daily progress" },
    { value: `${remainingMinutes} min`, label: "remaining focus time" },
    {
      value: `${plan.completedCount} / ${plan.totalTasks}`,
      label: "tasks completed",
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brown-label">
            {formatPlanDate()}
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-navy">
            Today&apos;s study plan
          </h2>
          <p className="mt-1 text-sm text-gray-secondary">
            Prioritized around your weak topics, deadlines, and available time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onAddTask}
            className="flex items-center gap-1.5 rounded-full border border-gray-light bg-white px-4 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-beige-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            <Plus size={14} aria-hidden="true" />
            Add task
          </button>

          <button
            type="button"
            onClick={onStartNextTask}
            disabled={!canStartNext}
            className="rounded-full bg-navy px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:cursor-not-allowed disabled:opacity-40"
          >
            Start next task
          </button>

          <button
            type="button"
            onClick={onClearPlan}
            className="text-xs font-medium text-gray-secondary underline-offset-4 hover:text-navy hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            Clear plan
          </button>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl bg-white px-5 py-5"
          >
            <dd className="text-2xl font-bold tabular-nums text-navy">
              {stat.value}
            </dd>
            <dt className="mt-1 text-xs text-gray-secondary">{stat.label}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
}
