"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, CalendarDays, Check, Clock3, Trash2, X } from "lucide-react";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";

type StudyBlockPanelProps = {
  event: CalendarEvent;
  canMarkDone?: boolean;
  onClose: () => void;
  onMarkDone: () => Promise<void>;
  onRemove: () => Promise<void>;
  onOpenPlan: () => void;
};

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function StudyBlockPanel({ event, canMarkDone = true, onClose, onMarkDone, onRemove, onOpenPlan }: StudyBlockPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      console.error("Study block action failed:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function keepFocusInside(keyEvent: React.KeyboardEvent<HTMLDivElement>) {
    if (keyEvent.key !== "Tab") return;
    const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
    if (!buttons?.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (keyEvent.shiftKey && document.activeElement === first) {
      keyEvent.preventDefault();
      last.focus();
    } else if (!keyEvent.shiftKey && document.activeElement === last) {
      keyEvent.preventDefault();
      first.focus();
    }
  }

  const dateLabel = new Date(event.startTime).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  const durationMinutes = Math.round(
    (new Date(event.endTime).getTime() - new Date(event.startTime).getTime()) / 60_000,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onMouseDown={(mouseEvent) => { if (mouseEvent.target === mouseEvent.currentTarget && !busy) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="study-block-title"
        onKeyDown={keepFocusInside}
        className="w-full max-w-md rounded-2xl border border-border-light bg-bg-container p-5 shadow-xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-brown-label">Study block</span>
            <span className="rounded-full bg-bg-warm px-2.5 py-1 text-xs font-semibold text-text-main">
              {event.done ? "Done" : "Planned"}
            </span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close study block details"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-bg-warm hover:text-text-main focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-50"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <h3 id="study-block-title" className="mt-3 text-xl font-semibold leading-snug text-text-main">
          {event.title}
        </h3>

        <div className="mt-5 space-y-3 rounded-xl border border-border-light bg-bg-warm/40 p-4">
          <div className="flex items-start gap-3">
            <Clock3 size={18} className="mt-0.5 shrink-0 text-brown-label" aria-hidden="true" />
            <div>
              <p className="text-base font-semibold text-text-main">{formatTime(event.startTime)}–{formatTime(event.endTime)}</p>
              <p className="mt-0.5 text-sm text-text-muted">{durationMinutes}-minute study block</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-text-muted">
            <CalendarDays size={18} className="shrink-0 text-brown-label" aria-hidden="true" />
            <span>{dateLabel}{event.className ? ` · ${event.className}` : ""}</span>
          </div>
        </div>

        {!event.done && !canMarkDone && (
          <p className="mt-4 text-sm text-text-muted">This task is running in Focus mode. Finish it there.</p>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}

        <div className="mt-6 flex flex-wrap gap-2">
          {!event.done && canMarkDone && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(onMarkDone)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-text-inverse hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-50"
            >
              <Check size={16} aria-hidden="true" /> Mark done
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onOpenPlan}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border-light px-4 text-sm font-semibold text-text-main hover:bg-bg-warm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-50"
          >
            View in plan <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 border-t border-border-light pt-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(onRemove)}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-bg-warm hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-50"
          >
            <Trash2 size={15} aria-hidden="true" /> Remove from schedule
          </button>
        </div>
      </div>
    </div>
  );
}
