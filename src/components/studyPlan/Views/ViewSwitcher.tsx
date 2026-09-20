"use client";

import type { PlanViewMode } from "@/src/library/studyPlan/types";

const views: { mode: PlanViewMode; label: string }[] = [
  { mode: "list", label: "List" },
  { mode: "board", label: "Board" },
  { mode: "schedule", label: "Schedule" },
];

interface ViewSwitcherProps {
  current: PlanViewMode;
  onChange: (mode: PlanViewMode) => void;
}

export default function ViewSwitcher({ current, onChange }: ViewSwitcherProps) {
  return (
    <div
      className="flex items-center gap-1 rounded-full bg-gray-input p-1"
      aria-label="Plan view"
    >
      {views.map((v) => {
        const isActive = current === v.mode;
        return (
          <button
            key={v.mode}
            type="button"
            onClick={() => onChange(v.mode)}
            aria-pressed={isActive}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${
              isActive
                ? "bg-navy text-white"
                : "text-gray-secondary hover:text-navy"
            }`}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}
