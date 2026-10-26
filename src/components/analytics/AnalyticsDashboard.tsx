"use client";

import { useState, type FormEvent } from "react";
import { Download, ExternalLink, RefreshCw } from "lucide-react";
import type { AnalyticsReport } from "@/src/library/analyticsReportContract";
import type {
  HealthReport,
  RealtimeReport,
} from "@/src/library/monitoring/types";
import { useAdminReport } from "@/src/hooks/useAdminReport";
import { AnalyticsEvents } from "./AnalyticsEvents";
import { Metric, Notice } from "./dashboardShared";
import { AnalyticsHealth, HealthSummary } from "./AnalyticsHealth";
import { AnalyticsOverview } from "./AnalyticsOverview";
import {
  buttonClass,
  displayDate,
  displayTime,
  inputClass,
  exportAnalytics,
} from "./dashboardUtils";

export default function AnalyticsDashboard({
  analyticsUrl,
}: {
  analyticsUrl?: string;
}) {
  const [preset, setPreset] = useState("7days");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [query, setQuery] = useState("start=7days");
  const [refresh, setRefresh] = useState(0);
  const [tab, setTab] = useState("Overview");
  const analytics = useAdminReport<AnalyticsReport>(
    `/api/admin/analytics?${query}`,
    refresh,
  );
  const realtime = useAdminReport<RealtimeReport>(
    "/api/admin/analytics/realtime",
    refresh,
    true,
  );
  const health = useAdminReport<HealthReport>(
    "/api/admin/health",
    refresh,
    true,
  );
  const report = analytics.data;
  const live = realtime.data;
  const peaks =
    live?.peaks && report?.peaks
      ? {
          concurrent: live.peaks.concurrent ?? report.peaks.concurrent,
          concurrentAt:
            live.peaks.concurrent !== null
              ? live.peaks.concurrentAt
              : report.peaks.concurrentAt,
          daily: report.peaks.daily ?? live.peaks.daily,
          dailyDate: report.peaks.dailyDate ?? live.peaks.dailyDate,
          since: live.peaks.since || report.peaks.since,
        }
      : (live?.peaks ?? report?.peaks ?? null);
  const eventCount = (name: string) =>
    report?.events.find((row) => row.label === name)?.count ?? 0;
  const interactions =
    report?.events.reduce(
      (total, row) => total + (row.label === "page_view" ? 0 : row.count),
      0,
    ) ?? 0;

  function applyFilter(event: FormEvent) {
    event.preventDefault();
    const parameters = new URLSearchParams({
      start: preset === "custom" ? start : preset,
    });
    if (preset === "custom") parameters.set("end", end);
    setQuery(parameters.toString());
    setRefresh((value) => value + 1);
  }

  return (
    <section className="min-h-screen bg-bg-main px-4 py-8 text-text-main sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Administration
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Usage analytics
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              Understand what students use, and how your services are
              performing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {analyticsUrl && (
              <a
                className={buttonClass}
                href={analyticsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Analytics <ExternalLink size={15} />
              </a>
            )}
            <button
              className={buttonClass}
              disabled={!report}
              onClick={() =>
                report &&
                exportAnalytics(report.events, report.startDate, report.endDate)
              }
            >
              <Download size={15} />
              Export CSV
            </button>
          </div>
        </header>
        <form onSubmit={applyFilter} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-2 text-xs text-text-muted">
            Date range
            <select
              className={inputClass}
              value={preset}
              onChange={(event) => setPreset(event.target.value)}
            >
              <option value="7days">Last 7 days</option>
              <option value="30days">Last 30 days</option>
              <option value="custom">Custom dates</option>
            </select>
          </label>
          {preset === "custom" && (
            <>
              <label className="flex flex-col gap-2 text-xs text-text-muted">
                Start date
                <input
                  type="date"
                  required
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-2 text-xs text-text-muted">
                End date
                <input
                  type="date"
                  required
                  min={start}
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                  className={inputClass}
                />
              </label>
            </>
          )}
          <button
            className={`${buttonClass} border-primary bg-primary text-text-inverse hover:bg-primary-hover`}
            disabled={analytics.loading}
          >
            <RefreshCw size={15} />
            Apply / refresh
          </button>
          {report && (
            <p className="pb-2 text-xs text-text-muted">
              {displayDate(report.startDate)} – {displayDate(report.endDate)} ·{" "}
              {report.timeZone}
            </p>
          )}
        </form>
        {health.data && <HealthSummary report={health.data} />}
        {health.error && (
          <Notice error>Service status unavailable: {health.error}</Notice>
        )}
        <div
          className="flex gap-6 overflow-x-auto border-b border-border-light"
          aria-label="Analytics views"
        >
          {["Overview", "Event explorer", "Service health"].map((name) => (
            <button
              key={name}
              aria-pressed={tab === name}
              onClick={() => setTab(name)}
              className={`whitespace-nowrap border-b-2 pb-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${tab === name ? "border-primary font-semibold text-primary" : "border-transparent text-text-muted"}`}
            >
              {name}
            </button>
          ))}
        </div>
        {tab === "Service health" ? (
          <>
            {health.loading && !health.data && (
              <Notice>Checking services…</Notice>
            )}
            {health.data && <AnalyticsHealth report={health.data} />}
          </>
        ) : (
          <>
            {analytics.loading && !report && (
              <Notice>Loading analytics…</Notice>
            )}
            {analytics.error && <Notice error>{analytics.error}</Notice>}
            {realtime.error && (
              <Notice error>
                Realtime users unavailable: {realtime.error}
              </Notice>
            )}
            <div className="grid divide-y divide-border-light overflow-hidden rounded-2xl border border-border-light bg-bg-container sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4">
              <Metric
                label="Concurrent users"
                value={live?.concurrentUsers ?? null}
                detail={
                  live
                    ? `GA4 active users in the last ${live.windowMinutes} minutes`
                    : realtime.loading
                      ? "Loading realtime report…"
                      : "Realtime count unavailable"
                }
              />
              <Metric
                label="Active users"
                value={report?.activeUsers ?? null}
                detail="Distinct active users in the selected period"
              />
              <Metric
                label="Peak concurrent users"
                value={peaks?.concurrent ?? null}
                detail={
                  peaks?.concurrent !== null && peaks?.concurrent !== undefined
                    ? `Highest observed 5-minute count · ${displayTime(peaks.concurrentAt)}`
                    : "No saved peak available"
                }
              />
              <Metric
                label="Peak daily users"
                value={peaks?.daily ?? null}
                detail={
                  peaks?.dailyDate
                    ? `Highest observed daily count · ${displayDate(peaks.dailyDate)}`
                    : "Highest daily count observed since monitoring began"
                }
              />
            </div>
            {(live || peaks) && (
              <p className="text-xs leading-relaxed text-text-muted">
                {live && `Realtime sampled ${displayTime(live.checkedAt)}. `}
                {peaks?.since &&
                  `Peak sampling began ${displayTime(peaks.since)}.`}{" "}
                These are GA4 activity estimates, not open connections. Peaks
                can miss activity between samples.
              </p>
            )}
            {((live && !live.storageAvailable) ||
              (report && !report.storageAvailable)) && (
              <Notice error>
                Counts are available, but saving user history failed. Peak
                counts may be incomplete.
              </Notice>
            )}
            {report?.limited && (
              <Notice>
                Google applied thresholds, sampling, or row limits. Counts may
                be incomplete.
              </Notice>
            )}
            {report && (
              <>
                <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-border-light bg-bg-container xl:grid-cols-4">
                  <Metric
                    label="Page views"
                    value={eventCount("page_view")}
                    detail="Visits in the selected period"
                  />
                  <Metric
                    label="Feature interactions"
                    value={interactions}
                    detail="Approved feature events"
                  />
                  <Metric
                    label="Quizzes completed"
                    value={eventCount("quiz_completed")}
                    detail="Recorded quiz completions"
                  />
                  <Metric
                    label="Study sessions completed"
                    value={eventCount("study_session_completed")}
                    detail="Recorded session completions"
                  />
                </div>
                {tab === "Overview" ? (
                  <AnalyticsOverview report={report} />
                ) : (
                  <AnalyticsEvents rows={report.events} />
                )}
                <p className="text-xs leading-relaxed text-text-muted">
                  Report retrieved {displayTime(report.retrievedAt)}. GA4
                  processing may delay recent activity. Document contents, chat
                  text, names, and emails are excluded from tracked events.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
