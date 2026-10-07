"use client";

import { useAnalytics } from "@/src/hooks/useAnalytics";

export default function AnalyticsPreference() {
  const { enabled, setEnabled } = useAnalytics();

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
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Share usage analytics"
          onClick={() => setEnabled(!enabled)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            enabled ? "bg-primary" : "bg-border-light"
          }`}
        >
          <span
            className={`absolute left-[2px] top-[2px] h-5 w-5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      <p className="mt-3 text-xs text-text-muted">
        This setting applies to this browser. Turning it off stops future
        collection, but does not delete activity already shared.
      </p>
    </section>
  );
}
