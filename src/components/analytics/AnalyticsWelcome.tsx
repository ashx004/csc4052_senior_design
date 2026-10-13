"use client";

import { useEffect, useRef, useState } from "react";
import { useAnalytics } from "@/src/hooks/useAnalytics";
import { defaultAnalyticsChoice } from "@/src/library/analyticsPreferences";
import AnalyticsSwitch from "./AnalyticsSwitch";

export default function AnalyticsWelcome() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [shareUsage, setShareUsage] = useState(defaultAnalyticsChoice);
  const { setEnabled, isSaving, error, needsReload, retry } = useAnalytics();

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="analytics-welcome-title"
      aria-describedby="analytics-welcome-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!isSaving) void setEnabled(false);
      }}
      className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-border-light bg-bg-container p-6 text-text-main shadow-xl backdrop:bg-black/40 backdrop:backdrop-blur-sm sm:p-8"
    >
      <h2 id="analytics-welcome-title" className="text-xl font-semibold">
        Help improve Catalyst
      </h2>
      <p
        id="analytics-welcome-description"
        className="mt-3 text-sm leading-relaxed text-text-muted"
      >
        Would you like to share page visits and feature activity? Document
        contents, chat text, names, and emails are excluded.
      </p>
      <div className="mt-6 flex items-center justify-between gap-4 border-y border-border-light py-4">
        <span className="text-sm font-medium">Share usage analytics</span>
        <AnalyticsSwitch
          enabled={shareUsage}
          onChange={setShareUsage}
          disabled={isSaving || needsReload}
        />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-text-muted">
        Your choice applies to your account. You can change it in Settings at
        any time. Sharing starts after you save your choice.
      </p>
      {error && (
        <p role="alert" className="mt-4 text-sm text-alert-error">
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={() => void setEnabled(false)}
          disabled={isSaving || needsReload}
          className="rounded-lg border border-border-light px-4 py-2 text-sm font-medium hover:bg-bg-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          Don’t share
        </button>
        <button
          type="button"
          onClick={() => void setEnabled(shareUsage)}
          disabled={isSaving || needsReload}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save choice"}
        </button>
      </div>
      {error && (
        <button
          type="button"
          onClick={() => void retry()}
          disabled={isSaving}
          className="mt-3 rounded-lg border border-border-light px-3 py-2 text-sm text-text-main hover:bg-bg-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          {needsReload ? "Reload preferences" : "Retry saving choice"}
        </button>
      )}
    </dialog>
  );
}
