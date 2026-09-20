"use client";

import type { ActivityPreference } from "@/src/library/studyPlan/types";
import { Wand2, ClipboardList, Layers, BookOpen, MessageCircle } from "lucide-react";

const options: {
  value: ActivityPreference;
  label: string;
  icon: typeof Wand2;
}[] = [
  { value: "auto", label: "Auto", icon: Wand2 },
  { value: "quiz", label: "Quiz", icon: ClipboardList },
  { value: "flashcards", label: "Flashcards", icon: Layers },
  { value: "reading", label: "Reading", icon: BookOpen },
  { value: "ai_explanation", label: "AI Explanation", icon: MessageCircle },
];

interface PreferenceStepProps {
  selected: ActivityPreference | undefined;
  onSelect: (pref: ActivityPreference) => void;
}

export default function PreferenceStep({
  selected,
  onSelect,
}: PreferenceStepProps) {
  return (
    <div>
      <h3 className="mb-1 text-lg font-semibold text-text-main">
        Activity preference
      </h3>
      <p className="mb-4 text-sm text-text-muted">
        Choose a study method or let us pick the best one.
      </p>
      <div className="flex flex-col gap-2">
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
