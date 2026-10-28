"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { formatUsd } from "@/src/library/billing/money";

// Email/password signups reach the dashboard before verifying their address,
// and the free trial waits for that (one trial per inbox). This tells them
// so, instead of leaving them at $0 with no reason.

const DISMISS_KEY = "catalyst:trial-verify-dismissed";

function wasDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

type Props = {
  user: User;
  trialMicros: number;
  /** Re-reads the wallet; the server grants the trial once the address is verified. */
  refresh: () => Promise<void>;
};

export default function TrialVerifyNotice({ user, trialMicros, refresh }: Props) {
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [busy, setBusy] = useState<"send" | "check" | null>(null);
  const [message, setMessage] = useState("");

  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Hidden for this page view only.
    }
  }

  async function resend() {
    setBusy("send");
    setMessage("");
    try {
      const response = await fetch("/api/auth/email-verification", {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Couldn't send the email. Try again in a minute.");
      if (data?.reason === "already-verified") {
        await refresh();
        setMessage("Your email is already verified.");
      } else {
        setMessage(`Sent. Check ${user.email ?? "your inbox"}.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't send the email. Try again in a minute.");
    } finally {
      setBusy(null);
    }
  }

  async function check() {
    setBusy("check");
    setMessage("");
    try {
      // While the trial is still pending, this notice stays and says so; once
      // it's granted, the wallet no longer reports it and the welcome toast shows.
      await refresh();
      setMessage("Not verified yet. Open the link in the email first.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div role="status" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm rounded-xl border border-border-light bg-bg-container p-4 pr-10 text-sm text-text-main shadow-xl sm:left-auto sm:right-6 sm:mx-0">
      <p className="font-semibold">Verify your email to get {formatUsd(trialMicros)} of free AI credit.</p>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">
        We sent a link to {user.email ?? "your email"}. Open it, then come back here and the credit is added.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={check}
          disabled={busy !== null}
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-primary-hover disabled:opacity-50"
        >
          {busy === "check" ? "Checking..." : "I've verified"}
        </button>
        <button
          type="button"
          onClick={resend}
          disabled={busy !== null}
          className="rounded border border-border-light bg-bg-container px-3 py-1.5 text-xs font-medium text-text-main hover:bg-bg-warm disabled:opacity-50"
        >
          {busy === "send" ? "Sending..." : "Resend email"}
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-text-muted">{message}</p>}
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="absolute right-2 top-2 rounded p-1 text-text-muted hover:bg-bg-warm">×</button>
    </div>
  );
}
