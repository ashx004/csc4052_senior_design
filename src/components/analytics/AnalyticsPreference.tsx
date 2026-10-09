"use client";

import AnalyticsSwitch from "./AnalyticsSwitch";
import { useAnalytics } from "@/src/hooks/useAnalytics";

export default function AnalyticsPreference() {
  const {
    enabled,
    setEnabled,
    isLoading,
    isSaving,
    error,
    needsReload,
    retry,
  } = useAnalytics();

  return (
    <section className="mt-2 flex w-3/4 self-center flex-col bg-bg-main px-3 py-4 text-text-main hover:bg-bg-warm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">Share usage analytics</h2>
          <p className="mt-1 text-xs text-text-muted">
            Help improve Catalyst by sharing page visits and feature activity.
            Document contents, chat text, names, and emails are excluded.
          </p>
        </div>
        <AnalyticsSwitch
          enabled={enabled}
          onChange={(nextEnabled) => void setEnabled(nextEnabled)}
          disabled={isLoading || isSaving || needsReload}
        />
      </div>
      <p className="mt-3 text-xs text-text-muted">
        This setting applies to your account. Turning it off stops future
        collection, but does not delete activity already shared.
      </p>
      {(isLoading || isSaving) && (
        <p role="status" className="mt-2 text-xs text-text-muted">
          {isSaving ? "Saving your choice…" : "Loading your choice…"}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-alert-error">
          {error}
        </p>
      )}
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
    </section>
  );
}
