"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Gauge, X } from "lucide-react";
import { CHAT_SPEEDS, type ChatSpeed } from "@/src/library/chatSpeed";
import type { SLASH_COMMANDS } from "@/src/library/slashCommands";
import { formatUsd, usdToMicros } from "@/src/library/billing/money";

// The strip under every chat box: how full the conversation's memory is,
// what the chat has cost, and the speed setting. Modeled on the context
// meters in ChatGPT and Claude: always visible, one click for details.

function MemoryRing({ fill }: { fill: number }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  const tone = fill >= 0.9 ? "text-alert-error" : fill >= 0.7 ? "text-amber-500" : "text-primary";
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="-rotate-90">
      <circle cx="9" cy="9" r={r} fill="none" strokeWidth="2.5" className="stroke-border-light" />
      <circle cx="9" cy="9" r={r} fill="none" strokeWidth="2.5" strokeLinecap="round" className={`stroke-current ${tone}`} strokeDasharray={c} strokeDashoffset={c * (1 - fill)} />
    </svg>
  );
}

function Popover({ open, onClose, children, align = "left" }: { open: boolean; onClose: () => void; children: ReactNode; align?: "left" | "right" }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={`absolute bottom-full z-40 mb-2 w-72 rounded-xl border border-border-light bg-bg-container p-3 text-left shadow-xl ${align === "right" ? "right-0" : "left-0"}`}>
      {children}
    </div>
  );
}

export type ChatControlsProps = {
  /** 0-1 from memoryFill(): 1 means the next message triggers a summary. */
  memory: number;
  /** Whether older messages have already been folded into a summary. */
  summarized: boolean;
  costMicros: number;
  /** Cloud AI on for this account: show cost and speed. */
  cloudAi: boolean;
  speed: ChatSpeed;
  onSpeed: (speed: ChatSpeed) => void;
  onCompact?: () => void;
  compacting?: boolean;
  compact?: boolean;
};

export default function ChatControls({ memory, summarized, costMicros, cloudAi, speed, onSpeed, onCompact, compacting, compact }: ChatControlsProps) {
  const [open, setOpen] = useState<"memory" | "speed" | null>(null);
  const current = CHAT_SPEEDS.find((s) => s.id === speed) ?? CHAT_SPEEDS[1];
  const percent = Math.round(memory * 100);

  return (
    <div className={`flex items-center gap-1 text-xs text-text-muted ${compact ? "" : "px-1"}`} data-tutorial="ai-chat-controls">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(open === "memory" ? null : "memory")}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-bg-warm"
          aria-label={`Chat memory ${percent}% full`}
          title="Chat memory"
        >
          <MemoryRing fill={memory} />
          <span>{percent}%</span>
        </button>
        <Popover open={open === "memory"} onClose={() => setOpen(null)}>
          <p className="text-sm font-semibold text-text-main">Chat memory: {percent}% full</p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            The assistant rereads this conversation with every message. When it fills up, older messages are summarized
            automatically and the latest ones are kept word for word, so replies stay fast and cheap.
            {summarized && " Earlier parts of this chat are already summarized."}
          </p>
          {onCompact && (
            <button
              type="button"
              onClick={() => {
                setOpen(null);
                onCompact();
              }}
              disabled={compacting}
              className="mt-2 rounded-lg border border-border-light px-2.5 py-1 text-xs font-medium text-text-main hover:bg-bg-warm disabled:opacity-50"
            >
              {compacting ? "Summarizing..." : "Summarize now (/compact)"}
            </button>
          )}
        </Popover>
      </div>

      {cloudAi && (
        <span className="px-1" title="AI credit this chat has used">
          {formatUsd(costMicros)}
        </span>
      )}

      {cloudAi && (
        <div className="relative ml-auto">
          <button
            type="button"
            onClick={() => setOpen(open === "speed" ? null : "speed")}
            className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-bg-warm"
            aria-label={`Response speed: ${current.label}`}
            data-tutorial="ai-chat-speed"
          >
            <Gauge size={14} aria-hidden="true" />
            {current.label}
            <ChevronDown size={12} aria-hidden="true" />
          </button>
          <Popover open={open === "speed"} onClose={() => setOpen(null)} align="right">
            <p className="mb-2 text-sm font-semibold text-text-main">Response speed</p>
            <ul className="space-y-1">
              {CHAT_SPEEDS.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSpeed(s.id);
                      setOpen(null);
                    }}
                    className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-bg-warm ${s.id === speed ? "bg-bg-warm" : ""}`}
                  >
                    <Check size={14} className={`mt-0.5 shrink-0 ${s.id === speed ? "text-primary" : "invisible"}`} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="flex items-baseline justify-between gap-2 text-sm font-medium text-text-main">
                        {s.label}
                        <span className="text-xs font-normal text-text-muted">~{formatUsd(usdToMicros(s.typicalUsd))}/msg</span>
                      </span>
                      <span className="block text-xs leading-snug text-text-muted">{s.description}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Popover>
        </div>
      )}
    </div>
  );
}

/** Suggestions shown above the chat box while the student types a "/" command. */
export function SlashMenu({ items, active, onPick }: { items: typeof SLASH_COMMANDS; active: number; onPick: (usage: string) => void }) {
  if (!items.length) return null;
  return (
    <ul role="listbox" aria-label="Commands" className="absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-xl border border-border-light bg-bg-container py-1 shadow-xl">
      {items.map((c, i) => (
        <li key={c.id} role="option" aria-selected={i === active}>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault(); // keep focus in the chat box
              onPick(c.usage);
            }}
            className={`flex w-full items-baseline gap-3 px-3 py-1.5 text-left ${i === active ? "bg-bg-warm" : "hover:bg-bg-warm"}`}
          >
            <span className="shrink-0 font-mono text-xs font-semibold text-text-main">{c.usage}</span>
            <span className="truncate text-xs text-text-muted">{c.description}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A command's answer (/cost, /help ...), shown above the chat box rather than in the conversation the AI reads. */
export function ChatNotice({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
  return (
    <div role="status" className="relative mb-2 rounded-xl border border-border-light bg-bg-container px-3 py-2 pr-8 text-xs leading-relaxed text-text-main shadow-sm">
      {children}
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="absolute right-1.5 top-1.5 rounded p-1 text-text-muted hover:bg-bg-warm">
        <X size={12} />
      </button>
    </div>
  );
}
