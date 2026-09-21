"use client";

import { ArrowRight, RotateCcw } from "lucide-react";

interface CarryoverPromptProps {
  taskCount: number;
  onContinue: () => void;
  onStartFresh: () => void;
}

export default function CarryoverPrompt({
  taskCount,
  onContinue,
  onStartFresh,
}: CarryoverPromptProps) {
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
      <p className="text-sm font-medium text-text-main">
        You have {taskCount} task{taskCount === 1 ? "" : "s"} from yesterday.
      </p>
      <div className="mt-3 flex gap-3">
        <button
          onClick={onContinue}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          Continue <ArrowRight size={14} />
        </button>
        <button
          onClick={onStartFresh}
          className="flex items-center gap-1.5 rounded-lg border border-border-light px-4 py-2 text-sm font-medium text-text-main hover:bg-bg-main"
        >
          <RotateCcw size={14} /> Start fresh
        </button>
      </div>
    </div>
  );
}
