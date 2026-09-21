"use client";

import { PartyPopper, Plus, Sparkles } from "lucide-react";

interface PlanCompletedStateProps {
  completedCount: number;
  onAddMore: () => void;
  onSuggestTasks: () => void;
}

export default function PlanCompletedState({
  completedCount,
  onAddMore,
  onSuggestTasks,
}: PlanCompletedStateProps) {
  return (
    <div className="mt-8 rounded-2xl bg-white p-8 text-center">
      <PartyPopper size={32} className="mx-auto mb-3 text-brown-label" />
      <h3 className="text-lg font-semibold text-navy">
        Great work today!
      </h3>
      <p className="mt-1 text-sm text-gray-secondary">
        You completed {completedCount} task{completedCount === 1 ? "" : "s"}.
        Keep it up!
      </p>
      <p className="mt-3 text-sm text-gray-secondary">
        You&apos;ve already completed your plan! Want to add more?
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={onSuggestTasks}
          className="flex items-center gap-1.5 rounded-full bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
        >
          <Sparkles size={16} /> Get suggestions
        </button>
        <button
          type="button"
          onClick={onAddMore}
          className="flex items-center gap-1.5 rounded-full border border-gray-light bg-white px-4 py-2 text-sm font-medium text-navy hover:bg-beige-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
        >
          <Plus size={16} /> Add manually
        </button>
      </div>
    </div>
  );
}
