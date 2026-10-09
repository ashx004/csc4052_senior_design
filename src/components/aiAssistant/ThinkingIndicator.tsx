"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { formatElapsed, recordStep, type ThinkingStep } from "@/src/library/thinkingSteps";

/**
 * What the assistant is doing while a reply is on its way: the current step,
 * how long it has been, and (tap to open) the steps so far. Remembers its own
 * history, so callers only pass the latest status line.
 */
export default function ThinkingIndicator({
  status,
  compact = false,
  fallback = "Thinking",
}: {
  status: string | null;
  compact?: boolean;
  fallback?: string;
}) {
  const startedAt = useRef(Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [steps, setSteps] = useState<ThinkingStep[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setSteps((previous) => recordStep(previous, status, Date.now() - startedAt.current));
  }, [status]);

  const elapsed = now - startedAt.current;
  const label = status || `${fallback}...`;
  const past = steps.slice(0, -1);
  const canExpand = past.length > 0;

  return (
    <div className={`flex min-w-0 flex-col ${compact ? "gap-1" : "gap-1.5"}`} role="status" aria-live="polite">
      <button
        type="button"
        onClick={() => canExpand && setOpen((o) => !o)}
        aria-expanded={canExpand ? open : undefined}
        disabled={!canExpand}
        className={`flex min-w-0 items-center gap-2 text-left text-text-muted ${canExpand ? "cursor-pointer hover:text-text-main" : "cursor-default"}`}
      >
        <Loader2 size={compact ? 12 : 14} className="shrink-0 animate-spin" />
        <span className={`min-w-0 ${compact ? "text-xs" : "text-sm"}`}>{label}</span>
        <span className="shrink-0 text-xs tabular-nums opacity-70">{formatElapsed(elapsed)}</span>
        {canExpand && <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && canExpand && (
        <ol className="ml-1 space-y-1 border-l border-border-light pl-3">
          {past.map((step, i) => (
            <li key={`${step.label}-${i}`} className="flex items-center gap-2 text-xs text-text-muted">
              <Check size={11} className="shrink-0 text-primary" />
              <span className="min-w-0 flex-1">{step.label}</span>
              <span className="shrink-0 tabular-nums opacity-70">{formatElapsed((steps[i + 1]?.at ?? elapsed) - step.at)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
