"use client";

import { useAnalytics } from "@/src/hooks/useAnalytics";

export default function AnalyticsPreference() {
  const { enabled, setEnabled } = useAnalytics();

  return (
    <section className="mx-auto mt-6 w-full border-b border-border-light px-6 pb-5 text-text-main sm:w-3/4 sm:px-2">
      <h2 className="text-sm font-semibold">Privacy</h2>
      <label className="mt-4 flex cursor-pointer items-start justify-between gap-6 rounded-lg py-2 hover:bg-bg-warm">
        <span>
          <span className="block text-sm font-medium">Share usage analytics</span>
          <span className="mt-1 block max-w-2xl text-xs leading-relaxed text-text-muted">
            Help improve Catalyst by sharing page visits and feature activity.
            Document contents, chat text, names, and emails are excluded.
          </span>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border-light accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </label>
      <p className="mt-2 text-xs leading-relaxed text-text-muted">
        This setting applies to this browser. Turning it off stops future
        collection, but does not delete activity already shared.
      </p>
    </section>
  );
}
