"use client";

import { useState } from "react";

interface RescheduleModalProps {
  open: boolean;
  onReschedule: (date: string) => void;
  onCancel: () => void;
}

function getNextDays(count: number): { label: string; value: string }[] {
  const days: { label: string; value: string }[] = [];
  const today = new Date();
  for (let i = 1; i <= count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    days.push({ value, label });
  }
  return days;
}

export default function RescheduleModal({
  open,
  onReschedule,
  onCancel,
}: RescheduleModalProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const days = getNextDays(14);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-2xl bg-bg-container p-6 shadow-xl ring-1 ring-border-light">
        <h3 className="text-lg font-semibold text-text-main">
          Reschedule to...
        </h3>
        <div className="mt-3 max-h-60 overflow-y-auto">
          {days.map((d) => (
            <button
              key={d.value}
              onClick={() => setSelected(d.value)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                selected === d.value
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-text-main hover:bg-bg-main"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-text-muted hover:text-text-main"
          >
            Cancel
          </button>
          <button
            onClick={() => selected && onReschedule(selected)}
            disabled={!selected}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            Reschedule
          </button>
        </div>
      </div>
    </div>
  );
}
