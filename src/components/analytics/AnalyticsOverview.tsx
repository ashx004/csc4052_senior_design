import type {
  AnalyticsReport,
  ReportRow,
} from "@/src/library/analyticsReportContract";
import { displayDate, panelClass } from "./dashboardUtils";

const pageNames: Record<string, string> = {
  "/": "Landing",
  "/login": "Sign in",
  "/signup": "Sign up",
  "/learning": "Learning",
  "/learning/classes": "Class learning",
  "/learning/study-plan": "Study plan",
  "/classes": "Classes",
  "/dashboard": "Home",
  "/notes": "Notes",
  "/notes/ocr": "Scan notes (OCR)",
  "/notes/[noteId]": "Note viewer",
  "/ai-assistant": "AI Assistant",
  "/calendar": "Calendar",
  "/advising_new": "Advising",
  "/profile": "Profile",
  "/settings": "Settings",
  "/billing": "Billing",
  "/help": "Help",
  "/summary": "Summaries",
  "/discover": "Discover",
  "/custom/new": "New custom study set",
  "/custom/[setId]": "Custom study set",
  "/share/[shareId]": "Shared item",
  "/legal/[doc]": "Legal document",
  "/courses/[courseId]": "Course home",
  "/courses/[courseId]/due-dates": "Course due dates",
  "/courses/[courseId]/learning": "Course learning",
  "/courses/[courseId]/notes": "Course notes",
  "/courses/[courseId]/summaries": "Course summaries",
  "/courses/[courseId]/discover": "Course discover",
  "/courses/[courseId]/discover/blocks": "Course study blocks",
  "/courses/[courseId]/discover/[publicSetId]": "Shared course set",
  "/courses/[courseId]/assignments": "Course assignments",
  "/courses/[courseId]/flashcards": "Course flashcards",
  "/courses/[courseId]/flashcards/[setId]": "Course flashcard set",
  "/courses/[courseId]/practice": "Course practice",
  "/courses/[courseId]/practice/[setId]": "Course practice set",
  "/courses/[courseId]/quizzes/[quizId]": "Course quiz",
  "/admin/analytics": "Usage analytics (Admin)",
  "/other": "Other routes",
};

function count(rows: ReportRow[], label: string) {
  return rows.find((row) => row.label === label)?.count ?? 0;
}

export function ActivityChart({ report }: { report: AnalyticsReport }) {
  const dates: string[] = [];
  for (
    let timestamp = Date.parse(report.startDate);
    timestamp <= Date.parse(report.endDate);
    timestamp += 86400_000
  ) {
    dates.push(
      new Date(timestamp).toISOString().slice(0, 10).replaceAll("-", ""),
    );
  }
  const views = dates.map((date) => count(report.dailyPageViews, date));
  const features = dates.map((date, index) =>
    Math.max(0, count(report.daily, date) - views[index]),
  );
  const maximum = Math.max(4, ...views, ...features);
  const top = Math.ceil(maximum / 4) * 4;
  const x = (index: number) =>
    dates.length === 1 ? 330 : 55 + (index / (dates.length - 1)) * 550;
  const y = (value: number) => 210 - (value / top) * 160;
  const line = (values: number[]) =>
    values
      .map((value, index) => `${index ? "L" : "M"}${x(index)},${y(value)}`)
      .join(" ");
  const hasActivity = report.daily.some((row) => row.count > 0);
  return (
    <section className={panelClass}>
      <h2 className="font-semibold">Activity over time</h2>
      <p className="mt-1 text-sm text-text-muted">
        Daily visits and feature interactions.
      </p>
      <div className="mt-5 flex gap-5 text-xs text-text-muted">
        <span className="flex items-center gap-2">
          <i className="h-2 w-2 rounded-full bg-primary" />
          Page views
        </span>
        <span className="flex items-center gap-2">
          <i className="h-2 w-2 rounded-full bg-text-muted" />
          Feature interactions
        </span>
      </div>
      {!hasActivity ? (
        <p className="py-16 text-center text-sm text-text-muted">
          No recorded activity for this period.
        </p>
      ) : (
        <svg
          viewBox="0 0 650 250"
          className="mt-4 w-full"
          role="img"
          aria-label={`Daily page views and feature interactions, ${report.startDate} to ${report.endDate}`}
        >
          <text x="55" y="18" className="fill-text-muted text-[11px]">
            Events (count)
          </text>
          {[0, 1, 2, 3, 4].map((step) => (
            <g key={step}>
              <line
                x1="55"
                x2="605"
                y1={y((top * step) / 4)}
                y2={y((top * step) / 4)}
                className="stroke-border-light"
              />
              <text
                x="45"
                y={y((top * step) / 4) + 4}
                textAnchor="end"
                className="fill-text-muted text-[11px]"
              >
                {((top * step) / 4).toLocaleString()}
              </text>
            </g>
          ))}
          <path
            d={line(views)}
            fill="none"
            className="stroke-primary"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path
            d={line(features)}
            fill="none"
            className="stroke-text-muted"
            strokeWidth="2"
            strokeDasharray="5 4"
          />
          {dates.map((date, index) => (
            <g key={date}>
              <circle
                cx={x(index)}
                cy={y(views[index])}
                r={dates.length > 31 ? 2 : 3}
                className="fill-primary"
              >
                <title>
                  {displayDate(date)}: {views[index]} page views,{" "}
                  {features[index]} feature interactions
                </title>
              </circle>
              {(index % Math.max(1, Math.ceil(dates.length / 6)) === 0 ||
                index === dates.length - 1) && (
                <text
                  x={x(index)}
                  y="237"
                  textAnchor="middle"
                  className="fill-text-muted text-[11px]"
                >
                  {displayDate(date)}
                </text>
              )}
            </g>
          ))}
        </svg>
      )}
      <p className="mt-2 text-xs text-text-muted">
        Source: GA4 · {report.startDate} – {report.endDate} · Dates in{" "}
        {report.timeZone}
      </p>
    </section>
  );
}

export function AnalyticsOverview({ report }: { report: AnalyticsReport }) {
  const pages = [...report.pages].sort((a, b) => b.count - a.count);
  const maxPageViews = Math.max(1, pages[0]?.count ?? 1);
  const leading =
    pages.find(
      (page) => page.label !== "/other" && page.label !== "/admin/analytics",
    ) ?? pages[0];
  const totalViews = count(report.events, "page_view");
  const workflows = [
    { name: "Quizzes", start: "quiz_started", outcome: "quiz_completed" },
    {
      name: "Resource uploads",
      start: "resource_upload_started",
      outcome: "resource_upload_succeeded",
    },
    {
      name: "Study sessions",
      start: "study_session_started",
      outcome: "study_session_completed",
    },
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <ActivityChart report={report} />
        <section className="rounded-2xl bg-navy p-6 text-white sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
            This period's takeaway
          </p>
          <h2 className="mt-5 text-2xl font-medium leading-relaxed text-white">
            {leading?.count
              ? `${pageNames[leading.label] ?? leading.label} leads the activity.`
              : "Your next insights start with shared activity."}
          </h2>
          {leading && totalViews > 0 && (
            <>
              <p className="mt-6 text-5xl font-medium tracking-tight text-white">
                {Math.round((leading.count / totalViews) * 100)}%
              </p>
              <p className="mt-3 text-sm leading-relaxed text-white/65">
                of recorded page views went to this page.
              </p>
            </>
          )}
          <p className="mt-7 border-t border-white/15 pt-5 text-xs leading-relaxed text-white/65">
            Reports include shared activity. Blocked collection and GA4
            processing delays can affect counts.
          </p>
        </section>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <section className={panelClass}>
          <h2 className="font-semibold">Where students go</h2>
          <p className="mt-1 text-sm text-text-muted">
            Most visited pages · Page views
          </p>
          {pages.length === 0 ? (
            <p className="py-8 text-sm text-text-muted">
              No recorded page views for this period.
            </p>
          ) : (
            pages.slice(0, 8).map((page, index) => (
              <div key={page.label} className="mt-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-xs text-text-muted">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <p className="break-all text-sm font-medium">
                        {pageNames[page.label] ?? page.label}
                      </p>
                      <p className="mt-1 break-all text-xs text-text-muted">
                        {page.label}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-medium tabular-nums">
                    {page.count.toLocaleString()}
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-warm">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${(page.count / maxPageViews) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </section>
        <section className={panelClass}>
          <h2 className="font-semibold">From start to finish</h2>
          <p className="mt-1 text-sm text-text-muted">
            Workflow outcomes at a glance.
          </p>
          {workflows.map((workflow) => {
            const starts = count(report.events, workflow.start);
            const outcomes = count(report.events, workflow.outcome);
            const percent = starts
              ? Math.round((outcomes / starts) * 100)
              : null;
            return (
              <div
                key={workflow.name}
                className="border-b border-border-light py-5 last:border-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium">{workflow.name}</h3>
                    <p className="mt-1 text-xs text-text-muted">
                      {outcomes.toLocaleString()} outcomes /{" "}
                      {starts.toLocaleString()} starts
                    </p>
                  </div>
                  <p className="text-xl tabular-nums">
                    {percent === null ? "—" : `${percent}%`}
                  </p>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-warm">
                  <div
                    className="h-full rounded-full bg-text-muted"
                    style={{ width: `${Math.min(100, percent ?? 0)}%` }}
                  />
                </div>
              </div>
            );
          })}
          <p className="mt-4 rounded-lg bg-bg-warm p-3 text-xs leading-relaxed text-text-muted">
            Outcomes ÷ starts in this period. These are event ratios, not
            matched journeys, and can exceed 100% when a workflow starts before
            this period.
          </p>
        </section>
      </div>
    </div>
  );
}
