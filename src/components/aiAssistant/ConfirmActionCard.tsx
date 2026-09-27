"use client";

// The Confirm / Cancel card under a chat reply that proposed a change
// (deleting, moving, rewriting, or editing class details). Nothing changes
// until the student presses Confirm - see src/library/pendingActions.ts.

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { notifyDataChanged } from "@/src/library/dataChanged";

export type PendingActionCardData = { id: string; title: string; details: string[] };

type Status = "loading" | "pending" | "working" | "done" | "cancelled" | "expired" | "failed";

export default function ConfirmActionCard({ action, compact = false }: { action: PendingActionCardData; compact?: boolean }) {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string | null>(null);

  // A card reopened from chat history shows what already happened to it.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/chat/confirm?id=${encodeURIComponent(action.id)}`)
      .then((res) => (res.ok ? res.json() : res.status === 404 ? { status: "expired", message: "No longer available - nothing was changed." } : null))
      .then((data) => {
        if (cancelled) return;
        if (!data) return setStatus("pending");
        setStatus(data.status === "applying" ? "working" : data.status);
        if (data.message) setMessage(data.message);
      })
      .catch(() => !cancelled && setStatus("pending"));
    return () => {
      cancelled = true;
    };
  }, [action.id]);

  async function decide(decision: "confirm" | "cancel") {
    setStatus("working");
    try {
      const res = await fetch("/api/chat/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: action.id, decision }),
      });
      const data = await res.json().catch(() => ({}));
      setStatus((data.status as Status) || "failed");
      if (data.status === "done") notifyDataChanged();
      setMessage(data.message || data.error || "Something went wrong. Try again.");
    } catch {
      setStatus("pending");
      setMessage("Couldn't reach the server. Try again.");
    }
  }

  const settled = status === "done" || status === "cancelled" || status === "expired" || status === "failed";
  const tone =
    status === "done"
      ? "border-green-300 bg-green-50"
      : status === "failed"
        ? "border-red-300 bg-red-50"
        : settled
          ? "border-border-light bg-bg-container opacity-80"
          : "border-amber-300 bg-amber-50";

  return (
    <div role="group" aria-label={action.title} className={`w-full max-w-md rounded-lg border ${tone} ${compact ? "p-2.5 text-xs" : "p-3 text-sm"} text-text-main shadow-sm`}>
      <div className="flex items-start gap-2">
        {status === "done" ? (
          <Check size={compact ? 14 : 16} className="mt-0.5 shrink-0 text-green-700" />
        ) : status === "cancelled" || status === "expired" ? (
          <X size={compact ? 14 : 16} className="mt-0.5 shrink-0 text-text-muted" />
        ) : (
          <AlertTriangle size={compact ? 14 : 16} className="mt-0.5 shrink-0 text-amber-700" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{action.title}</p>
          <ul className="mt-1 space-y-0.5 text-text-muted">
            {action.details.map((d, i) => (
              <li key={i} className="break-words">{d}</li>
            ))}
          </ul>
          {settled || (message && status === "pending") ? (
            <p className="mt-2 font-medium" aria-live="polite">{message ?? (status === "expired" ? "Expired - nothing was changed." : "")}</p>
          ) : null}
          {!settled && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => decide("confirm")}
                disabled={status !== "pending"}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#1a1a2e] px-3 py-1.5 font-semibold text-text-inverse transition hover:bg-[#2a2a3e] disabled:opacity-60"
              >
                {status === "working" || status === "loading" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Confirm
              </button>
              <button
                type="button"
                onClick={() => decide("cancel")}
                disabled={status !== "pending"}
                className="rounded-md border border-border-light bg-bg-container px-3 py-1.5 font-semibold text-text-main transition hover:bg-bg-warm disabled:opacity-60"
              >
                Cancel
              </button>
              <span className="text-text-muted">Nothing changes until you confirm.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
