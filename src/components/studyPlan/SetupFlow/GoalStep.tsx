"use client";

import type { StudyGoal } from "@/src/library/studyPlan/types";
import { Target, TrendingDown, FileText, Compass } from "lucide-react";

const options: { value: StudyGoal; label: string; icon: typeof Target }[] = [
  { value: "exam_prep", label: "Exam prep", icon: Target },
  { value: "weak_topics", label: "Weak topics", icon: TrendingDown },
  { value: "assignment", label: "Assignment", icon: FileText },
  { value: "general", label: "General progress", icon: Compass },
];

interface GoalStepProps {
  selected: StudyGoal | undefined;
  onSelect: (goal: StudyGoal) => void;
}

export default function GoalStep({ selected, onSelect }: GoalStepProps) {
  return (
    <div>
      <h3 className="mb-1 text-lg font-semibold text-text-main">
        What&apos;s your goal?
      </h3>
      <p className="mb-4 text-sm text-text-muted">
        This helps us pick the right tasks for you.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {options.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              onClick={() => onSelect(opt.value)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                selected === opt.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border-light text-text-main hover:border-primary/50"
              }`}
            >
              <Icon size={16} />
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
