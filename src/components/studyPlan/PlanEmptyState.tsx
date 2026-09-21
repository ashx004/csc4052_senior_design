"use client";

import { Sparkles } from "lucide-react";

interface PlanEmptyStateProps {
  onStartSetup: () => void;
}

export default function PlanEmptyState({ onStartSetup }: PlanEmptyStateProps) {
  return (
    <div className="mt-8 rounded-2xl border border-dashed border-border-light p-8 text-center">
      <Sparkles size={32} className="mx-auto mb-3 text-primary" />
      <h3 className="text-lg font-semibold text-text-main">
        Ready to study?
      </h3>
      <p className="mt-1 text-sm text-text-muted">
        Create a study plan and Catalyst will recommend tasks based on your
        progress.
      </p>
      <button
        onClick={onStartSetup}
        className="mt-4 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
      >
        Start study plan
      </button>
    </div>
  );
}
