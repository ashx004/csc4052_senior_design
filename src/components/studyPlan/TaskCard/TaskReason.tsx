"use client";

import { ChevronDown, ChevronUp } from "lucide-react";

interface TaskReasonProps {
  reason: string | null;
  expanded: boolean;
  onToggle: () => void;
}

export default function TaskReason({
  reason,
  expanded,
  onToggle,
}: TaskReasonProps) {
  if (!reason) return null;

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-xs font-medium text-brown-label hover:text-navy"
      >
        Why this task?
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {expanded && (
        <p className="mt-1 text-xs text-gray-secondary">{reason}</p>
      )}
    </div>
  );
}
