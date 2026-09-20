"use client";

import { PartyPopper, Plus } from "lucide-react";

interface PlanCompletedStateProps {
  completedCount: number;
  onAddMore: () => void;
}

export default function PlanCompletedState({
  completedCount,
  onAddMore,
}: PlanCompletedStateProps) {
  return (
    <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-8 text-center dark:border-emerald-800 dark:bg-emerald-950/20">
      <PartyPopper size={32} className="mx-auto mb-3 text-emerald-500" />
      <h3 className="text-lg font-semibold text-text-main">
        Great work today!
      </h3>
      <p className="mt-1 text-sm text-text-muted">
        You completed {completedCount} task{completedCount === 1 ? "" : "s"}.
        Keep it up!
      </p>
      <p className="mt-3 text-sm text-text-muted">
        You&apos;ve already completed your plan! Want to add more?
      </p>
      <button
        onClick={onAddMore}
        className="mt-3 flex items-center gap-1.5 mx-auto rounded-lg border border-border-light px-4 py-2 text-sm font-medium text-text-main hover:bg-bg-main"
      >
        <Plus size={16} /> Add a task
      </button>
    </div>
  );
}
