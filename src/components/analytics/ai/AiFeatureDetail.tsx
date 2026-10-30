"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Clock, Database, TriangleAlert, type LucideIcon } from "lucide-react";
import { featureDescription } from "@/src/library/billing/aiFeatures";
import type { AdminAiReport } from "@/src/library/billing/aiUsageReports";
import type { FeatureDetail, NotableRow } from "@/src/library/billing/dailyRollup";
import { Notice } from "../dashboardShared";
import { panelClass, type AiFeatureView } from "../dashboardUtils";
import { formatShare, hasNoSummaries, percentileText, plural, seconds, usd } from "./format";
import { MissingDaysNotice, NoSummaries, TruncatedNotice } from "./MissingDaysNotice";
import { BROWN_STRONG, LAVENDER_STRONG, PURPLE, RED_STRONG, SAGE_STRONG, TAN, labelText } from "./palette";
import { StaleBanner } from "./StaleBanner";
import { useAiReport } from "./useAiReport";

type Feature = AdminAiReport["features"][number];

const DASH = "—";
const PRESETS = [1, 7, 14, 30];
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const tokens = (input: number, output: number) => `${compact.format(input)} / ${compact.format(output)}`;
const duration = (ms: number | null) => (ms === null ? DASH : seconds(ms));
const lastDays = (days: number) => (days === 1 ? "last 1 day" : `last ${days} days`);
const STATUS: Record<NotableRow["status"], string> = { ok: "Success", incomplete: "Stopped", error: "Failed" };

// Tinted boxes fix their own text colours, so they read the same under every theme.
const MODES: Record<AiFeatureView, {
  badge: string; question: string; icon: LucideIcon; chip: string; card: string; value: string; label: string;
}> = {
  slow: {
    badge: "Slowest request time", question: "which requests were slow, and was this unusual?", icon: Clock,
    chip: "bg-[#fbf1e6] text-[#8a6539]", card: "border-[#f0dfca] bg-[#fbf1e6]", value: "text-[#3d3a34]", label: "text-[#8a6539]",
  },
  cost: {
    badge: "Most expensive", question: "what is driving the cost?", icon: Database,
    chip: "bg-[#efedfc] text-[#4f43b8]", card: "border-[#dcd8f6] bg-[#efedfc]", value: "text-[#3d3a34]", label: "text-[#4f43b8]",
  },
  fail: {
    badge: "Most failures", question: "what failed, when, and why?", icon: TriangleAlert,
    chip: "bg-[#fbe9e8] text-[#a3302a]", card: "border-[#f3cfcb] bg-[#fbe9e8]", value: "text-[#a3302a]", label: "text-[#a3302a]",
  },
};

/** "Oct 29, 10:14 PM" in `timeZone` (the viewer's own when omitted). */
function requestTime(iso: string, timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone,
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("month")} ${part("day")}, ${part("hour")}:${part("minute")} ${part("dayPeriod")}`;
}

/** "Oct 24" for a UTC day key. */
function dayLabel(day: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00.000Z`));
}

const edgeLabel = (ms: number) => (ms < 1000 ? `${ms} ms` : `${ms / 1000} s`);

/** A sentence only when every listed request sent more input than the feature's average; null when that is not so.
 * Five rows against an average is too little to call a cause, so it only says the inputs may be a factor. */
function inputObservation(rows: NotableRow[], feature: Feature | undefined, what: string, factor: string): string | null {
  if (!feature || feature.requests === 0 || rows.length < 2) return null;
  const average = feature.inputTokens / feature.requests;
  if (!(average > 0) || !rows.every((r) => r.inputTokens > average)) return null;
  return `Every ${what} request listed here also sent more input than this feature's average (${compact.format(average)} tokens per request); ${factor} may be a factor.`;
}

const headClass = `border-b border-border-light text-xs ${labelText}`;
const th = "px-3 py-2 font-medium";
const td = "px-3 py-2.5 whitespace-nowrap";
const rowClass = "border-b border-border-light last:border-0";
const success = (status: NotableRow["status"]) => (status === "ok" ? "text-[#4d7342]" : "");

function Stat({ label, value, tone }: { label: string; value: string; tone?: AiFeatureView }) {
  const t = tone ? MODES[tone] : null;
  return (
    <div data-stat className={`flex flex-col rounded-xl border p-4 ${t ? t.card : "border-border-light bg-bg-container"}`}>
      <dt className={`text-xs ${t ? t.label : labelText}`}>{label}</dt>
      <dd className={`order-first text-2xl font-semibold tabular-nums tracking-tight ${t ? t.value : "text-text-main"}`}>{value}</dd>
    </div>
  );
}

function Stats({ children }: { children: ReactNode }) {
  return <dl className="grid gap-3 sm:grid-cols-3">{children}</dl>;
}

function Panel({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section className={panelClass}>
      <h2 className="font-semibold">{title}</h2>
      {sub && <p className={`mt-1 text-xs ${labelText}`}>{sub}</p>}
      {children}
    </section>
  );
}

function Dot({ color }: { color: string }) {
  return <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

function Footnote({ children }: { children: ReactNode }) {
  return <p className={`mt-3 text-xs leading-relaxed ${labelText}`}>{children}</p>;
}

function Distribution({ detail }: { detail: FeatureDetail }) {
  const { durationHist: counts, durationEdgesMs: edges } = detail;
  const used = counts.flatMap((n, i) => (n > 0 ? [i] : []));
  if (used.length === 0) return null;
  const shown = counts.slice(used[0], used[used.length - 1] + 1).map((n, k) => ({ i: used[0] + k, n }));
  const max = Math.max(...shown.map((b) => b.n));
  // The last bucket has no upper edge; it holds everything above the last one.
  const label = (i: number) => (i < edges.length ? edgeLabel(edges[i]) : `> ${edgeLabel(edges[edges.length - 1])}`);
  const range = (i: number) => (i < edges.length ? `up to ${edgeLabel(edges[i])}` : `over ${edgeLabel(edges[edges.length - 1])}`);
  // A percentile above the last edge sits in the open-topped bucket, index edges.length.
  const bucketOf = (ms: number | null, aboveMs: number | null) => (aboveMs !== null ? edges.length : ms === null ? -1 : edges.indexOf(ms));
  const p50 = bucketOf(detail.p50Ms, detail.p50AboveMs), p95 = bucketOf(detail.p95Ms, detail.p95AboveMs);
  const mark = (i: number) => (i === p95 ? "p95" : i === p50 ? "p50" : undefined);
  const color = (i: number) => (i === p95 ? RED_STRONG : i === p50 ? BROWN_STRONG : TAN);
  return (
    <div
      role="img"
      aria-label={`Request time distribution: ${shown.filter((b) => b.n > 0).map((b) => `${b.n.toLocaleString()} ${range(b.i)}`).join(", ")}`}
      className="mt-5"
    >
      <div className="flex h-44 items-end gap-1 border-b border-border-light">
        {shown.map((b) => (
          <div
            key={b.i}
            data-bucket={b.i}
            data-mark={mark(b.i)}
            className="flex-1 rounded-t-sm"
            style={{ height: b.n === 0 ? 0 : `${Math.max(2, (b.n / max) * 100)}%`, backgroundColor: color(b.i) }}
          />
        ))}
      </div>
      <div aria-hidden className="mt-1 flex gap-1">
        {shown.map((b) => (
          <span key={b.i} className={`min-w-0 flex-1 truncate text-center text-[10px] tabular-nums ${labelText}`}>{label(b.i)}</span>
        ))}
      </div>
    </div>
  );
}

function SlowView({ detail, feature, timeZone }: { detail: FeatureDetail; feature: Feature | undefined; timeZone?: string }) {
  const rows = detail.notable.slowest;
  const observation = inputObservation(rows, feature, "slow", "larger inputs");
  const p50 = percentileText(detail.p50Ms, detail.p50AboveMs), p95 = percentileText(detail.p95Ms, detail.p95AboveMs);
  return (
    <>
      <Stats>
        <Stat tone="slow" label="Worst case (p95)" value={p95} />
        <Stat label="Typical (p50)" value={p50} />
        <Stat label="Total requests" value={detail.requests.toLocaleString()} />
      </Stats>
      <Panel
        title="Request time distribution"
        sub={detail.timedCount > 0 ? "Each bar counts the requests that finished within its time. Bars right of p50 are what push p95 up." : undefined}
      >
        {detail.timedCount === 0 ? (
          <p className={`py-6 text-sm ${labelText}`}>No timed requests in this window: failed and stopped requests are not timed.</p>
        ) : (
          <>
            <Distribution detail={detail} />
            <div className="mt-3 flex flex-wrap gap-4 text-xs">
              <span className="flex items-center gap-1.5"><Dot color={BROWN_STRONG} />p50 · {p50}</span>
              <span className="flex items-center gap-1.5"><Dot color={RED_STRONG} />p95 · {p95}</span>
            </div>
            <Footnote>Bars come from the stored histogram, so times are accurate to the bucket width.</Footnote>
          </>
        )}
      </Panel>
      {rows.length > 0 && (
        <Panel
          title="Slowest individual requests"
          sub="The five slowest in this window. Each day stores only its own five, so there is no longer list."
        >
          <div className="mt-4 overflow-x-auto">
            <table aria-label="Slowest individual requests" className="w-full text-left text-sm">
              <thead>
                <tr className={headClass}>
                  {["Time", "Duration", "Status", "Model", "Tokens in / out"].map((name) => <th key={name} className={th}>{name}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.at}-${i}`} className={rowClass}>
                    <td className={td}>{requestTime(r.at, timeZone)}</td>
                    <td className={`${td} font-semibold tabular-nums ${i === 0 ? "text-[#a3302a]" : ""}`}>{duration(r.durationMs)}</td>
                    <td className={`${td} ${success(r.status)}`}>{STATUS[r.status]}</td>
                    <td className={`${td} font-mono text-xs`}>{r.model}</td>
                    <td className={`${td} tabular-nums`}>{tokens(r.inputTokens, r.outputTokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {observation && <Footnote>{observation}</Footnote>}
        </Panel>
      )}
    </>
  );
}

function CostPerDay({ days }: { days: FeatureDetail["days"] }) {
  const series = days.map((d) => ({
    day: d.day,
    average: d.pricedRequests ? d.costMicros / d.pricedRequests : null,
    max: d.maxCostMicros,
  }));
  const top = Math.max(0, ...series.flatMap((s) => [s.average ?? 0, s.max ?? 0]));
  if (top <= 0) {
    return <p className={`py-6 text-sm ${labelText}`}>No billed requests in this window, so there is no cost to chart.</p>;
  }
  const height = (micros: number) => `${Math.max(1, (micros / top) * 100)}%`;
  const amount = (micros: number | null) => (micros === null ? "none" : usd(Math.round(micros)));
  return (
    <>
      <div
        role="img"
        aria-label={`Cost per day: ${series.map((s) => `${dayLabel(s.day)} average ${amount(s.average)}, most expensive ${amount(s.max)}`).join("; ")}`}
        className="mt-5 flex gap-3"
      >
        <div aria-hidden className={`flex h-40 flex-col justify-between text-right text-[10px] tabular-nums ${labelText}`}>
          <span>{usd(Math.round(top))}</span>
          <span>{usd(0)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex h-40 items-end gap-3 border-b border-border-light">
            {series.map((s) => (
              <div key={s.day} data-day={s.day} className="flex h-full min-w-0 flex-1 items-end justify-center gap-1">
                {s.average !== null && (
                  <div data-series="average" className="w-3 rounded-t-sm" style={{ height: height(s.average), backgroundColor: LAVENDER_STRONG }} />
                )}
                {s.max !== null && (
                  <div data-series="max" className="w-3 rounded-t-sm" style={{ height: height(s.max), backgroundColor: PURPLE }} />
                )}
              </div>
            ))}
          </div>
          <div aria-hidden className="mt-1 flex gap-3">
            {series.map((s) => (
              <span key={s.day} className={`min-w-0 flex-1 truncate text-center text-[10px] ${labelText}`}>{dayLabel(s.day)}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1.5"><Dot color={LAVENDER_STRONG} />Average</span>
        <span className="flex items-center gap-1.5"><Dot color={PURPLE} />Most expensive</span>
      </div>
    </>
  );
}

function CostView({ detail, feature, totalAiCostMicros, timeZone }: {
  detail: FeatureDetail; feature: Feature | undefined; totalAiCostMicros: number; timeZone?: string;
}) {
  const cost = detail.days.reduce((total, d) => total + d.costMicros, 0);
  // A day summarised before the priced count was kept leaves the divisor unknown, so no average is shown.
  const priced = detail.days.some((d) => d.pricedRequests === null)
    ? null
    : detail.days.reduce((total, d) => total + (d.pricedRequests ?? 0), 0);
  const rows = detail.notable.costliest;
  const observation = inputObservation(rows, feature, "expensive", "longer inputs");
  return (
    <>
      <Stats>
        <Stat tone="cost" label="Total cost" value={usd(cost)} />
        <Stat label="Average per request" value={priced ? usd(Math.round(cost / priced)) : DASH} />
        <Stat label="Total requests" value={detail.requests.toLocaleString()} />
        <Stat label="Of total AI cost" value={formatShare(cost, totalAiCostMicros)} />
      </Stats>
      <Panel title="Cost per day" sub="The average billed request and the single most expensive one, for each day with a summary.">
        <CostPerDay days={detail.days} />
      </Panel>
      {rows.length > 0 && (
        <Panel
          title="Most expensive individual requests"
          sub="The five most expensive in this window. Each day stores only its own five, so there is no longer list."
        >
          <div className="mt-4 overflow-x-auto">
            <table aria-label="Most expensive individual requests" className="w-full text-left text-sm">
              <thead>
                <tr className={headClass}>
                  {["Time", "Cost", "Tokens in / out", "Duration", "Status"].map((name) => <th key={name} className={th}>{name}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.at}-${i}`} className={rowClass}>
                    <td className={td}>{requestTime(r.at, timeZone)}</td>
                    <td className={`${td} font-semibold tabular-nums`}>{usd(r.costMicros)}</td>
                    <td className={`${td} tabular-nums`}>{tokens(r.inputTokens, r.outputTokens)}</td>
                    <td className={`${td} tabular-nums`}>{duration(r.durationMs)}</td>
                    <td className={`${td} ${success(r.status)}`}>{STATUS[r.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {observation && <Footnote>{observation}</Footnote>}
        </Panel>
      )}
    </>
  );
}

/** `phrase` completes "Every failure in this window was …". */
const KINDS: Record<string, { label: string; phrase: string }> = {
  rate_limit: { label: "Rate limit", phrase: "a rate limit" },
  provider_error: { label: "Provider error", phrase: "a provider error" },
  timeout: { label: "Timeout", phrase: "a timeout" },
  network: { label: "Network", phrase: "a network error" },
  aborted: { label: "Aborted", phrase: "an aborted request" },
  unknown: { label: "Unknown", phrase: "of no recorded kind" },
};
/** Always listed, so a zero reads as a zero; any other kind is listed only when it occurred. */
const MAIN_KINDS = ["rate_limit", "provider_error", "timeout", "network"];
const kindOf = (kind: string) => (Object.hasOwn(KINDS, kind) ? KINDS[kind] : { label: kind, phrase: `of kind “${kind}”` });

function ErrorKinds({ detail, days }: { detail: FeatureDetail; days: number }) {
  const counts = detail.errorKinds;
  const extra = Object.entries(counts)
    .filter(([kind, n]) => !MAIN_KINDS.includes(kind) && n > 0)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
  const kinds: [string, number][] = [...MAIN_KINDS.map((kind): [string, number] => [kind, Object.hasOwn(counts, kind) ? counts[kind] : 0]), ...extra];
  const recorded = Object.values(counts).reduce((total, n) => total + n, 0);
  const occurred = kinds.filter(([, n]) => n > 0);
  const unrecorded = detail.errors - recorded;
  return (
    <Panel title={`Error kinds · ${lastDays(days)}`}>
      <ul aria-label="Error kinds" className="mt-4 space-y-2.5">
        {kinds.map(([kind, n]) => (
          <li key={kind} className="grid grid-cols-[8rem_2.5rem_1fr] items-center gap-3 text-sm">
            <span className="truncate">{kindOf(kind).label}</span>
            <span className="text-right font-semibold tabular-nums">{n.toLocaleString()}</span>
            <span aria-hidden className="h-2 overflow-hidden rounded-full bg-bg-warm">
              <span className="block h-full rounded-full" style={{ width: `${(n / Math.max(1, detail.errors)) * 100}%`, backgroundColor: RED_STRONG }} />
            </span>
          </li>
        ))}
      </ul>
      {occurred.length === 1 && recorded === detail.errors && (
        <Footnote>Every failure in this window was {kindOf(occurred[0][0]).phrase}.</Footnote>
      )}
      {unrecorded > 0 && (
        <Footnote>
          {unrecorded.toLocaleString()} {plural(unrecorded, "failure comes", "failures come")} from days summarised before error kinds were recorded.
        </Footnote>
      )}
    </Panel>
  );
}

function FailView({ detail, days, timeZone }: { detail: FeatureDetail; days: number; timeZone?: string }) {
  const { requests, errors } = detail;
  const fine = requests - errors;
  const rows = detail.notable.failures;
  const width = (n: number) => `${(n / requests) * 100}%`;
  return (
    <>
      <Stats>
        <Stat tone="fail" label="Failed requests" value={`${errors.toLocaleString()} / ${requests.toLocaleString()}`} />
        <Stat label="Failure rate" value={`${((errors / requests) * 100).toFixed(1)}%`} />
        <Stat label="Typical (p50)" value={percentileText(detail.p50Ms, detail.p50AboveMs)} />
      </Stats>
      <Panel title="Request outcomes">
        <div
          role="img"
          aria-label={`${errors.toLocaleString()} failed, ${fine.toLocaleString()} did not fail, of ${requests.toLocaleString()} ${plural(requests, "request", "requests")}`}
          className="mt-4 flex h-4 w-full overflow-hidden rounded bg-bg-warm"
        >
          {errors > 0 && <div data-outcome="failed" style={{ width: width(errors), backgroundColor: RED_STRONG }} />}
          {fine > 0 && <div data-outcome="ok" style={{ width: width(fine), backgroundColor: SAGE_STRONG }} />}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5"><Dot color={RED_STRONG} />Failed · {errors.toLocaleString()}</span>
          <span className="flex items-center gap-1.5"><Dot color={SAGE_STRONG} />Did not fail · {fine.toLocaleString()}</span>
          <span className={`ml-auto ${labelText}`}>Total: {requests.toLocaleString()} {plural(requests, "request", "requests")}</span>
        </div>
      </Panel>
      {errors === 0 ? (
        <section className={panelClass}>
          <p className={`text-sm ${labelText}`}>Nothing failed in the {lastDays(days)}.</p>
        </section>
      ) : (
        <>
          <Panel
            title="Recent failed requests"
            sub={"No error message text is stored, because messages can carry student content. Only the provider's status code and a coarse error kind."}
          >
            {rows.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table aria-label="Recent failed requests" className="w-full text-left text-sm">
                  <thead>
                    <tr className={headClass}>
                      {["Time", "Error kind", "HTTP", "Model", "Tokens in / out"].map((name) => <th key={name} className={th}>{name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={`${r.at}-${i}`} className={rowClass}>
                        <td className={td}>{requestTime(r.at, timeZone)}</td>
                        <td className={td}>
                          <span className="flex items-center gap-1.5"><Dot color={RED_STRONG} />{kindOf(r.errorKind || "unknown").label}</span>
                        </td>
                        <td className={`${td} tabular-nums`}>{r.httpStatus === null ? DASH : String(r.httpStatus)}</td>
                        <td className={`${td} font-mono text-xs`}>{r.model}</td>
                        <td className={`${td} tabular-nums`}>{tokens(r.inputTokens, r.outputTokens)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {rows.length < errors && (
              <Footnote>Showing the {rows.length.toLocaleString()} most recent of {errors.toLocaleString()} failures.</Footnote>
            )}
          </Panel>
          <ErrorKinds detail={detail} days={days} />
        </>
      )}
    </>
  );
}

const EMPTY: Record<AiFeatureView, (days: number) => string> = {
  slow: (days) => `No requests in the ${lastDays(days)}, so there is nothing to time.`,
  cost: (days) => `No requests in the ${lastDays(days)}, so nothing was spent.`,
  fail: (days) => `No requests in the ${lastDays(days)}, so nothing failed.`,
};

/** Breadcrumb, heading, window choice and the page's question: shown whether or not the data arrived. */
function FeatureFrame({ mode, feature, days, children }: { mode: AiFeatureView; feature: string; days: number; children: ReactNode }) {
  const m = MODES[mode];
  const Icon = m.icon;
  const description = featureDescription(feature);
  const crumb = "underline underline-offset-2 hover:text-primary";
  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className={`text-xs ${labelText}`}>
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href="/admin/analytics" className={crumb}>Analytics</Link></li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden>›</span>
            <Link href={`/admin/analytics/ai?days=${days}`} className={crumb}>AI performance</Link>
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden>›</span>
            <span aria-current="page" className="text-text-main">{feature}</span>
          </li>
        </ol>
      </nav>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${m.chip}`}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-all text-2xl font-semibold tracking-tight">{feature}</h1>
              <span data-badge className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${m.chip}`}>{m.badge}</span>
            </div>
            {description && <p data-description className={`mt-1 text-sm ${labelText}`}>{description}</p>}
          </div>
        </div>
        <nav aria-label="Time window" className="flex gap-1 rounded-xl border border-border-light bg-bg-container p-1">
          {PRESETS.map((preset) => (
            <Link
              key={preset}
              href={`/admin/analytics/ai/feature/${encodeURIComponent(feature)}?view=${mode}&days=${preset}`}
              aria-current={preset === days ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${preset === days ? "bg-primary text-text-inverse" : "text-text-main hover:bg-bg-warm"}`}
            >
              {preset}d
            </Link>
          ))}
        </nav>
      </header>
      <p className="text-sm">
        <strong className="font-semibold">The question this page answers:</strong> {m.question}
      </p>
      {children}
    </div>
  );
}

/** One feature's drill-down: why it is slow, what drives its cost, or what failed. */
export function AiFeatureDetail({ mode, feature, report, days, timeZone }: {
  mode: AiFeatureView;
  feature: string;
  report: AdminAiReport;
  days: number;
  /** Tests pin this; the page leaves it to the viewer's clock. */
  timeZone?: string;
}) {
  const detail = report.featureDetail;
  const stats = report.features.find((f) => f.feature === feature);
  let body: ReactNode;
  if (!detail || detail.feature !== feature) {
    body = <Notice error>This report has no detail for this feature.</Notice>;
  } else if (hasNoSummaries(report.missingDays, days)) {
    // Not "no requests": with no day summarised, nothing is known either way.
    body = <NoSummaries />;
  } else if (detail.requests === 0) {
    body = (
      <section className={panelClass}>
        <p className={`text-sm ${labelText}`}>{EMPTY[mode](days)}</p>
      </section>
    );
  } else if (mode === "cost") {
    body = <CostView detail={detail} feature={stats} totalAiCostMicros={report.money.costMicros} timeZone={timeZone} />;
  } else if (mode === "fail") {
    body = <FailView detail={detail} days={days} timeZone={timeZone} />;
  } else {
    body = <SlowView detail={detail} feature={stats} timeZone={timeZone} />;
  }
  return (
    <FeatureFrame mode={mode} feature={feature} days={days}>
      <StaleBanner builtAt={report.builtAt} source={report.source} staleReason={report.staleReason} timeZone={timeZone} />
      <MissingDaysNotice missingDays={report.missingDays} days={days} />
      <TruncatedNotice truncated={report.truncated} />
      {body}
    </FeatureFrame>
  );
}

/** The drill-down with its data. An unknown feature or a failed read shows the server's message under the same heading. */
export function AiFeatureDetailScreen({ mode, feature, days, timeZone }: {
  mode: AiFeatureView; feature: string; days: number; timeZone?: string;
}) {
  const { report, error, loading } = useAiReport(days, feature);
  if (!loading && !error && report) {
    return <AiFeatureDetail mode={mode} feature={feature} report={report} days={days} timeZone={timeZone} />;
  }
  return (
    <FeatureFrame mode={mode} feature={feature} days={days}>
      {loading ? <Notice>Loading {feature}…</Notice> : <Notice error>{error ?? "This report is temporarily unavailable."}</Notice>}
    </FeatureFrame>
  );
}
