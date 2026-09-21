"use client";

import { List, Columns3, Calendar } from "lucide-react";
import type { PlanViewMode } from "@/src/library/studyPlan/types";

const views: { mode: PlanViewMode; label: string; icon: typeof List }[] = [
  { mode: "list", label: "List", icon: List },
  { mode: "board", label: "Board", icon: Columns3 },
  { mode: "schedule", label: "Schedule", icon: Calendar },
];

interface ViewSwitcherProps {
  current: PlanViewMode;
  onChange: (mode: PlanViewMode) => void;
}

export default function ViewSwitcher({ current, onChange }: ViewSwitcherProps) {
  return (
    <div className="flex gap-1 rounded-[10px] bg-gray-input p-1">
      {views.map((v) => {
        const Icon = v.icon;
        return (
          <button
            key={v.mode}
            onClick={() => onChange(v.mode)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              current === v.mode
                ? "bg-navy text-white"
                : "text-gray-secondary hover:text-navy"
            }`}
          >
            <Icon size={14} />
            {v.label}
          </button>
        );
      })}
    </div>
  );
}
