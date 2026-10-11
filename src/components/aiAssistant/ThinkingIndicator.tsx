"use client";

import { useEffect, useRef, useState } from "react";
import { Brain, Check, ChevronDown, Loader2, X } from "lucide-react";
import { formatElapsed, recordStep, type ThinkingStep } from "@/src/library/thinkingSteps";
import { currentHeadline, type LiveActivity, type LiveTool } from "@/src/library/chatLive";

/** "Reading a document..." -> "Reading a document" (a colon and the detail follow it). */
const withoutDots = (label: string) => label.replace(/\.\.\.$/, "");

function ToolRow({ tool, compact }: { tool: LiveTool; compact: boolean }) {
  const text =
    tool.state === "running"
      ? tool.detail ? withoutDots(tool.label) : tool.label
      : tool.state === "failed"
        ? `${tool.doneLabel} (didn't work)`
        : tool.doneLabel;
  return (
    <li className={`flex min-w-0 items-center gap-2 ${compact ? "text-[11px]" : "text-xs"} text-text-muted`}>
      {tool.state === "running" ? (
        <Loader2 size={11} className="shrink-0 animate-spin text-primary" />
      ) : tool.state === "failed" ? (
        <X size={11} className="shrink-0 text-alert-error" />
      ) : (
        <Check size={11} className="shrink-0 text-primary" />
      )}
      <span className="shrink-0">{tool.detail && tool.state !== "failed" ? `${text}:` : text}</span>
      {tool.detail && tool.state !== "failed" && <span className="min-w-0 truncate font-medium text-text-main">{tool.detail}</span>}
    </li>
  );
}

/**
 * What the assistant is doing while a reply is on its way: the current step,
 * how long it has been, the tools it has used, and (tap to open) its reasoning
 * as it is written. Remembers its own history, so callers only pass the latest
 * status line and the live activity.
 */
export default function ThinkingIndicator({
  status,
  activity,
  compact = false,
  fallback = "Thinking",
}: {
  status: string | null;
  activity?: LiveActivity;
  compact?: boolean;
  fallback?: string;
}) {
  // When this indicator appeared; fixed for its lifetime.
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [steps, setSteps] = useState<ThinkingStep[]>([]);
  const [open, setOpen] = useState(false);
  const [showThoughts, setShowThoughts] = useState(false);
  const thoughtBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // A log of each status the indicator has shown and when it appeared: it has
    // to be written when `status` changes, which is exactly when this effect runs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSteps((previous) => recordStep(previous, status, Date.now() - startedAt));
  }, [status, startedAt]);

  const thoughts = activity?.thoughts ?? "";
  useEffect(() => {
    // Keep the newest reasoning in view as it streams in.
    if (showThoughts && thoughtBox.current) thoughtBox.current.scrollTop = thoughtBox.current.scrollHeight;
  }, [thoughts, showThoughts]);

  const elapsed = now - startedAt;
  const tools = activity?.tools ?? [];
  const running = tools.find((t) => t.state === "running");
  // The most specific thing known right now: a tool in use, else what the model
  // is reasoning about, else the pipeline stage.
  const headline = running ? (running.detail ? `${withoutDots(running.label)}: ${running.detail}` : running.label) : (activity && currentHeadline(activity)) || status || `${fallback}...`;
  const past = steps.slice(0, -1);
  const canExpand = past.length > 0;
  const text = compact ? "text-xs" : "text-sm";

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
        <span className={`min-w-0 ${text}`}>{headline}</span>
        <span className="shrink-0 text-xs tabular-nums opacity-70">{formatElapsed(elapsed)}</span>
        {canExpand && <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>

      {tools.length > 0 && (
        <ul className="ml-1 space-y-0.5 border-l border-border-light pl-3">
          {tools.map((tool) => (
            <ToolRow key={tool.id} tool={tool} compact={compact} />
          ))}
        </ul>
      )}

      {thoughts && (
        <div className="ml-1">
          <button
            type="button"
            onClick={() => setShowThoughts((v) => !v)}
            aria-expanded={showThoughts}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-main"
          >
            <Brain size={11} className="shrink-0" />
            {showThoughts ? "Hide thoughts" : "Show thoughts"}
            <ChevronDown size={11} className={`transition-transform ${showThoughts ? "rotate-180" : ""}`} />
          </button>
          {showThoughts && (
            <div
              ref={thoughtBox}
              className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-bg-warm px-3 py-2 text-[11px] italic leading-relaxed text-text-muted"
            >
              {thoughts}
            </div>
          )}
        </div>
      )}

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
