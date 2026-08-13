"use client";

import type { StudySetVisibility } from "@/src/library/discover/types";

interface VisibilitySelectorProps {
  value: StudySetVisibility;
  onChange: (value: StudySetVisibility) => void;
  disabled?: boolean;
}

export default function VisibilitySelector({
  value,
  onChange,
  disabled = false,
}: VisibilitySelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-xl border border-border-light p-1">
        <button
          type="button"
          onClick={() => onChange("public")}
          disabled={disabled}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            value === "public"
              ? "bg-[#1a1a2e] text-white"
              : "text-text-muted hover:bg-bg-warm"
          }`}
        >
          Share with classmates
        </button>
        <button
          type="button"
          onClick={() => onChange("private")}
          disabled={disabled}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            value === "private"
              ? "bg-[#1a1a2e] text-white"
              : "text-text-muted hover:bg-bg-warm"
          }`}
        >
          Keep private
        </button>
      </div>
      <p className="text-xs text-text-muted">
        Public sets may be recommended to students studying the same course.
      </p>
    </div>
  );
}
