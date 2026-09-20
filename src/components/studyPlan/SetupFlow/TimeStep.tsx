"use client";

import type { AvailableTime } from "@/src/library/studyPlan/types";
import { Clock } from "lucide-react";

const options: { value: AvailableTime; label: string }[] = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "90+ min" },
];

interface TimeStepProps {
  selected: AvailableTime | undefined;
  onSelect: (time: AvailableTime) => void;
}

export default function TimeStep({ selected, onSelect }: TimeStepProps) {
  return (
    <div>
      <h3 className="mb-1 text-lg font-semibold text-text-main">
        How much time do you have?
      </h3>
      <p className="mb-4 text-sm text-text-muted">
        We&apos;ll fit tasks into your available time.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
              selected === opt.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border-light text-text-main hover:border-primary/50"
            }`}
          >
            <Clock size={16} />
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
