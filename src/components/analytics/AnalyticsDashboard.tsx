"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { AnalyticsEvent } from "@/src/library/analyticsContract";
import type {
  AnalyticsReport,
  ReportRow,
} from "@/src/library/analyticsReportContract";

const WORKFLOW_EVENTS: AnalyticsEvent[] = [
  "quiz_started",
  "quiz_completed",
  "resource_upload_started",
  "resource_upload_succeeded",
  "resource_upload_failed",
  "study_session_started",
  "study_session_completed",
];

function ActivityCountsTable({
  title,
  rows,
}: {
  title: string;
  rows: ReportRow[];
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-border-light bg-bg-container p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-text-main">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">
          No recorded activity for this period.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm text-text-main">
            <thead>
              <tr className="border-b border-border-light text-xs text-text-muted">
                <th scope="col" className="pb-3 font-medium">
                  Activity
                </th>
                <th scope="col" className="pb-3 text-right font-medium">
                  Count
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-border-light last:border-0">
                  <td className="break-all py-3 pr-4">{row.label}</td>
                  <td className="py-3 text-right font-medium tabular-nums">
                    {row.count.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DailyActivityChart({
  rows,
  timeZone,
}: {
  rows: ReportRow[];
  timeZone: string;
}) {
  let largestCount = 1;
  for (const row of rows) {
    if (row.count > largestCount) {
      largestCount = row.count;
    }
  }

  return (
    <section className="rounded-2xl border border-border-light bg-bg-container p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-text-main">
        Daily tracked activity
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">
        Page views and approved feature events per date · counts · {timeZone}
      </p>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">
          No recorded activity for this period.
        </p>
      ) : (
        <div className="mt-6 max-h-80 space-y-3 overflow-y-auto">
          {rows.map((row) => {
            const dateLabel = formatReportDate(row.label);
            const barWidth = (row.count / largestCount) * 100;

            return (
              <div key={row.label} className="flex items-center gap-3 text-xs sm:text-sm">
                <span className="w-20 shrink-0 text-text-muted sm:w-24">
                  {dateLabel}
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-bg-warm">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <span className="w-12 text-right font-medium tabular-nums sm:w-16">
                  {row.count.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function formatReportDate(date: string): string {
  if (!/^\d{8}$/.test(date)) {
    return date;
  }
  const year = date.slice(0, 4);
  const month = date.slice(4, 6);
  const day = date.slice(6, 8);
  return `${year}-${month}-${day}`;
}

function ReportResults({ report }: { report: AnalyticsReport }) {
  function getEventCount(eventName: AnalyticsEvent): number {
    for (const event of report.events) {
      if (event.label === eventName) {
        return event.count;
      }
    }
    return 0;
  }

  const featureEvents: ReportRow[] = [];
  let totalInteractions = 0;
  for (const event of report.events) {
    if (event.label !== "page_view") {
      featureEvents.push(event);
      totalInteractions = totalInteractions + event.count;
    }
  }

  const workflowCounts: ReportRow[] = [];
  for (const eventName of WORKFLOW_EVENTS) {
    workflowCounts.push({ label: eventName, count: getEventCount(eventName) });
  }
  const summaryMetrics = [
    { label: "Page views", count: getEventCount("page_view") },
    { label: "Tracked interactions", count: totalInteractions },
    { label: "Quizzes completed", count: getEventCount("quiz_completed") },
    {
      label: "Study sessions completed",
      count: getEventCount("study_session_completed"),
    },
  ];

  return (
    <>
      <div className="space-y-1 text-xs leading-relaxed text-text-muted sm:text-sm">
        <p>{report.startDate} – {report.endDate} · {report.timeZone}</p>
        <p>
          Report retrieved {new Date(report.retrievedAt).toLocaleString()}.
          This is the retrieval time, not the latest event time.
        </p>
      </div>
      {report.limited && (
        <p
          role="status"
          className="rounded-xl border border-border-light bg-bg-warm px-4 py-3 text-sm text-text-main"
        >
          Google Analytics applied thresholds, sampling, or row limits. Totals
          may be incomplete.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryMetrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-2xl border border-border-light bg-bg-container p-5 shadow-sm"
          >
            <p className="text-sm text-text-muted">{metric.label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-text-main tabular-nums">
              {metric.count.toLocaleString()}
            </p>
          </div>
        ))}
      </div>
      <DailyActivityChart rows={report.daily} timeZone={report.timeZone} />
      <div className="grid gap-4 xl:grid-cols-2">
        <ActivityCountsTable title="Page views" rows={report.pages} />
        <ActivityCountsTable title="Feature events" rows={featureEvents} />
      </div>
      <ActivityCountsTable
        title="Workflow starts and outcomes"
        rows={workflowCounts}
      />
      <p className="text-xs leading-relaxed text-text-muted sm:text-sm">
        Starts and outcomes are independent event counts, not a matched user
        funnel. A workflow can start and finish in different reporting periods.
        Source: Google Analytics 4.
      </p>
    </>
  );
}

export default function AnalyticsDashboard() {
  const [datePreset, setDatePreset] = useState("7days");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [reportQuery, setReportQuery] = useState("start=7days");
  const [refreshCount, setRefreshCount] = useState(0);
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadReport() {
      setIsLoading(true);
      setErrorMessage("");
      setReport(null);

      try {
        const response = await fetch(`/api/admin/analytics?${reportQuery}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Could not load analytics.");
        }
        if (!controller.signal.aborted) {
          setReport(data);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          let message = "Could not load analytics.";
          if (error instanceof Error) {
            message = error.message;
          }
          setErrorMessage(message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadReport();
    return function cancelPreviousRequest() {
      controller.abort();
    };
  }, [reportQuery, refreshCount]);

  function applyDateFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let nextQuery = `start=${datePreset}`;
    if (datePreset === "custom") {
      const dateParameters = new URLSearchParams();
      dateParameters.set("start", customStartDate);
      dateParameters.set("end", customEndDate);
      nextQuery = dateParameters.toString();
    }

    setReportQuery(nextQuery);
    setRefreshCount((count) => count + 1);
  }

  return (
    <section className="min-h-screen bg-bg-main px-4 py-8 text-text-main sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <p className="mb-2 text-sm font-medium text-text-muted">
            Administration
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Usage analytics
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">
            Activity shared by users who enabled analytics. Blocked collection
            and processing delays can affect these reports.
          </p>
        </header>
        <form
          className="flex flex-wrap items-end gap-3 rounded-2xl border border-border-light bg-bg-container p-5 shadow-sm sm:p-6"
          onSubmit={applyDateFilter}
        >
          <label className="flex flex-col gap-2 text-sm font-medium">
            Date range
            <select
              className="min-w-40 rounded-lg border border-border-light bg-bg-main px-3 py-2 text-sm text-text-main outline-none focus:border-primary"
              value={datePreset}
              onChange={(event) => setDatePreset(event.target.value)}
            >
              <option value="7days">Last 7 days</option>
              <option value="30days">Last 30 days</option>
              <option value="custom">Custom dates</option>
            </select>
          </label>
          {datePreset === "custom" && (
            <>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Start date
                <input
                  className="rounded-lg border border-border-light bg-bg-main px-3 py-2 text-sm text-text-main outline-none focus:border-primary"
                  type="date"
                  value={customStartDate}
                  required
                  onChange={(event) => setCustomStartDate(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                End date
                <input
                  className="rounded-lg border border-border-light bg-bg-main px-3 py-2 text-sm text-text-main outline-none focus:border-primary"
                  type="date"
                  value={customEndDate}
                  min={customStartDate}
                  required
                  onChange={(event) => setCustomEndDate(event.target.value)}
                />
              </label>
            </>
          )}
          <button
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-text-inverse shadow-sm transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading}
          >
            Apply / refresh
          </button>
        </form>
        {isLoading && (
          <p role="status" className="text-sm text-text-muted">
            Loading analytics…
          </p>
        )}
        {errorMessage && (
          <p
            role="alert"
            className="rounded-xl border border-border-light bg-bg-container p-4 text-sm text-text-main"
          >
            {errorMessage}
          </p>
        )}
        {report && <ReportResults report={report} />}
      </div>
    </section>
  );
}
