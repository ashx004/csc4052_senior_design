"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ChevronRight, Coins, Database, FileText, Sparkles, Users, type LucideIcon } from "lucide-react";
import { FEATURE_NOTES, isStudentFeature } from "@/src/library/billing/aiFeatures";
import type { AdminAiReport } from "@/src/library/billing/aiUsageReports";
import { Notice } from "../dashboardShared";
import { panelClass } from "../dashboardUtils";
import { CostShareBar } from "./CostShareBar";
import { hasNoSummaries, percentileText, plural, seconds, usd } from "./format";
import { MissingDaysNotice, NoSummaries, TruncatedNotice } from "./MissingDaysNotice";
import { labelText, PEACH_STRONG, PURPLE, SAGE_STRONG, SKY_STRONG } from "./palette";
import { StaleBanner } from "./StaleBanner";
import { useAiReport } from "./useAiReport";

type Feature = AdminAiReport["features"][number];
type Model = AdminAiReport["models"][number];
type Stages = NonNullable<Feature["stages"]>;

const DASH = "—";
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const tokens = (input: number, output: number) => `${compact.format(input)} / ${compact.format(output)}`;
const pad = (n: number) => String(n).padStart(2, "0");

/** "52m 14s": a sum of durations, which runs well past what seconds read well in. */
function totalTime(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return seconds(ms);
  if (s < 3600) return `${Math.floor(s / 60)}m ${pad(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${pad(Math.floor((s % 3600) / 60))}m`;
}

/** Cents of AI cost per dollar of net cash kept; nothing earned means no ratio. */
function centsPerDollar(costMicros: number, netCashMicros: number) {
  if (netCashMicros <= 0) return DASH;
  const cents = (costMicros / netCashMicros) * 100;
  return cents > 0 && Number(cents.toFixed(1)) === 0 ? "<0.1¢" : `${cents.toFixed(1)}¢`;
}

const byCost = (a: Feature, b: Feature) => b.costMicros - a.costMicros || b.requests - a.requests || a.feature.localeCompare(b.feature);

const chipTones = {
  peach: "bg-[#fbf1e6] text-[#8a6539]",
  lavender: "bg-[#efedfc] text-[#4f43b8]",
  rose: "bg-[#fbe9e8] text-[#a3302a]",
};

function PanelHeading({ icon: Icon, tone, title, windowLabel }: {
  icon: LucideIcon; tone: keyof typeof chipTones; title: string; windowLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${chipTones[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <h2 className="flex items-baseline gap-1.5 font-semibold">
        {title}
        {windowLabel && <span className={`text-xs font-normal ${labelText}`}>· {windowLabel}</span>}
      </h2>
    </div>
  );
}

const headClass = `border-b border-border-light text-xs ${labelText}`;
const th = "px-3 py-2 font-medium";
const td = "px-3 py-2.5";
const num = "text-right tabular-nums whitespace-nowrap";
const rowClass = "border-b border-border-light last:border-0";

function RequestedModel({ counts }: { counts: Record<string, number> }) {
  const ranked = Object.entries(counts).sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
  if (ranked.length === 0) return <>{DASH}</>;
  return (
    <span title={ranked.map(([model, n]) => `${model}: ${n.toLocaleString()}`).join("\n")}>
      {ranked[0][0]}
      {ranked.length > 1 && <span className={labelText}> +{ranked.length - 1} more</span>}
    </span>
  );
}

function FeatureTable({ label, features, totalCostMicros }: { label: string; features: Feature[]; totalCostMicros: number }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table aria-label={label} className="w-full text-left text-sm">
        <thead>
          <tr className={headClass}>
            <th className={th}>Feature</th>
            <th className={th}>Model requested</th>
            <th className={`${th} text-right`}>Requests</th>
            <th className={`${th} text-right`}>Typical (p50)</th>
            <th className={`${th} text-right`}>Worst (p95)</th>
            <th className={`${th} text-right`}>Tokens in / out</th>
            <th className={`${th} text-right`} aria-sort="descending">Cost<span aria-hidden> ↓</span></th>
          </tr>
        </thead>
        <tbody>
          {features.map((f) => (
            <tr key={f.feature} className={rowClass}>
              <td className={td}>
                <span className="font-medium">{f.feature}</span>
                {FEATURE_NOTES[f.feature] && <span className={`block text-[11px] ${labelText}`}>{FEATURE_NOTES[f.feature]}</span>}
              </td>
              <td className={`${td} font-mono text-xs`}><RequestedModel counts={f.modelCounts} /></td>
              <td className={`${td} ${num}`}>{f.requests.toLocaleString()}</td>
              <td className={`${td} ${num}`}>{percentileText(f.p50Ms, f.p50AboveMs)}</td>
              <td className={`${td} ${num}`}>{percentileText(f.p95Ms, f.p95AboveMs)}</td>
              <td className={`${td} ${num}`}>{tokens(f.inputTokens, f.outputTokens)}</td>
              <td className={`${td} ${num}`}>
                <span className="flex items-center justify-end gap-2">
                  <CostShareBar micros={f.costMicros} totalMicros={totalCostMicros} />
                  <span className="font-semibold">{usd(f.costMicros)}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StudentFeatures({ features, totalCostMicros, windowLabel }: { features: Feature[]; totalCostMicros: number; windowLabel: string }) {
  const dashed = features.filter((f) => f.timedCount < 5);
  return (
    <section className={panelClass}>
      <PanelHeading icon={FileText} tone="peach" title="Student features" windowLabel={windowLabel} />
      <p className={`mt-1 text-xs ${labelText}`}>
        Typical is the median. Worst case is the 95th percentile. A dash means fewer than 5 timed requests; “&gt; 90 s” means above the slowest bucket.
      </p>
      {features.length === 0 ? (
        <p className={`py-8 text-sm ${labelText}`}>No student feature was used in this window.</p>
      ) : (
        <FeatureTable label="Student features" features={features} totalCostMicros={totalCostMicros} />
      )}
      <p className={`mt-3 text-xs leading-relaxed ${labelText}`}>
        <strong className="font-semibold text-text-main">Model requested</strong> is the model we asked for, not confirmed as the one that answered.{" "}
        {dashed.length > 0 && (
          <>
            {dashed.map((f, i) => (
              <span key={f.feature}>
                {i > 0 && ", "}
                <strong className="font-semibold text-text-main">{f.feature}</strong>
              </span>
            ))}{" "}
            {plural(dashed.length, "shows a dash because it has", "show a dash because they have")} fewer than 5 timed requests.{" "}
          </>
        )}
        Percentiles come from histogram buckets, so they are accurate to the bucket width.
      </p>
    </section>
  );
}

function Models({ models, windowLabel }: { models: Model[]; windowLabel: string }) {
  return (
    <section className={panelClass}>
      <PanelHeading icon={Database} tone="lavender" title="Models" windowLabel={windowLabel} />
      {models.length === 0 ? (
        <p className={`py-8 text-sm ${labelText}`}>No AI requests in this window.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table aria-label="Models" className="w-full text-left text-sm">
            <thead>
              <tr className={headClass}>
                <th className={th}>Model</th>
                {["Requests", "Total time", "p50", "p95", "Tokens in / out", "Cost", "Fallbacks"].map((name) => (
                  <th key={name} className={`${th} text-right`}>{name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.model} className={rowClass}>
                  <td className={`${td} font-medium`}>{m.model}</td>
                  <td className={`${td} ${num}`}>{m.requests.toLocaleString()}</td>
                  <td className={`${td} ${num} font-semibold`}>{totalTime(m.totalDurationMs)}</td>
                  <td className={`${td} ${num}`}>{percentileText(m.p50Ms, m.p50AboveMs)}</td>
                  <td className={`${td} ${num}`}>{percentileText(m.p95Ms, m.p95AboveMs)}</td>
                  <td className={`${td} ${num}`}>{tokens(m.inputTokens, m.outputTokens)}</td>
                  <td className={`${td} ${num} font-semibold`}>{usd(m.costMicros)}</td>
                  <td className={`${td} ${num} ${m.fallbacks > 0 ? "font-semibold text-[#a3302a]" : ""}`}>{m.fallbacks.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={`mt-3 text-xs leading-relaxed ${labelText}`}>
        <strong className="font-semibold text-text-main">Total time</strong> answers “which model is working hardest”.{" "}
        <strong className="font-semibold text-text-main">Fallbacks</strong> counts times this model was tried after another one failed.
      </p>
    </section>
  );
}

function PerDollar({ features, netCashMicros, windowLabel }: { features: Feature[]; netCashMicros: number; windowLabel: string }) {
  return (
    <section className={panelClass}>
      <PanelHeading icon={Coins} tone="peach" title="Cost per dollar earned" windowLabel={windowLabel} />
      <p className={`mt-1 text-xs ${labelText}`}>
        {netCashMicros > 0
          ? `Cents of AI cost for each student feature per $1 of net cash kept (${usd(netCashMicros)} in this window).`
          : "No net cash was kept in this window, so there is no per-dollar figure."}
      </p>
      <div className="mt-4 overflow-x-auto">
        <table aria-label="AI cost per dollar earned" className="w-full text-left text-sm">
          <thead>
            <tr className={headClass}>
              <th className={th}>Feature</th>
              <th className={`${th} text-right`}>Per $1 earned</th>
            </tr>
          </thead>
          <tbody>
            {features.map((f) => (
              <tr key={f.feature} className={rowClass}>
                <td className={`${td} font-medium`}>{f.feature}</td>
                <td className={`${td} ${num}`}>{centsPerDollar(f.costMicros, netCashMicros)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Students({ students, costMicros, days }: { students: AdminAiReport["students"]; costMicros: number; days: number }) {
  const active = students.filter((s) => s.requests >= 1);
  const top = [...active].sort((a, b) => b.chargeMicros - a.chargeMicros || b.requests - a.requests).slice(0, 10);
  const n = active.length;
  return (
    <section className={panelClass}>
      <PanelHeading icon={Users} tone="peach" title="Students" />
      <div data-testid="cost-per-student" className="mt-4 rounded-xl bg-[#fbf1e6] p-4">
        <p className="text-xs font-medium text-[#6b5a45]">Cost per active student</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-[#3d3a34]">
          {n === 0 ? DASH : usd(Math.round(costMicros / n))}
        </p>
        <p className="mt-1 text-[11px] text-[#6b5a45]">
          {n === 0
            ? "No student used AI in this window"
            : `${n.toLocaleString()} ${plural(n, "student", "students")} used AI ${days === 7 ? "this week" : "in this window"}`}
        </p>
      </div>
      {top.length > 0 && (
        <>
          <h3 className="mt-5 text-xs font-semibold">Top 10 spenders</h3>
          <div className="mt-2 overflow-x-auto">
            <table aria-label="Top 10 spenders" className="w-full text-left text-sm">
              <thead>
                <tr className={headClass}>
                  <th className={th}>Student</th>
                  <th className={`${th} text-right`}>Requests</th>
                  <th className={`${th} text-right`}>Spent</th>
                </tr>
              </thead>
              <tbody>
                {top.map((s) => (
                  <tr key={s.shortUid} className={rowClass}>
                    <td className={`${td} font-mono text-xs`}>{s.shortUid}</td>
                    <td className={`${td} ${num}`}>{s.requests.toLocaleString()}</td>
                    <td className={`${td} ${num} font-semibold`}>{usd(s.chargeMicros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className={`mt-3 text-xs ${labelText}`}>Shortened ids only. No email, no full id.</p>
    </section>
  );
}

const STAGES: { key: keyof Stages; label: string; color: string }[] = [
  { key: "waitMs", label: "Waiting", color: PEACH_STRONG },
  { key: "genMs", label: "Generating", color: PURPLE },
  { key: "overheadMs", label: "Our own code", color: SAGE_STRONG },
  { key: "deliverMs", label: "Delivery", color: SKY_STRONG },
];
const stageMs = (ms: number | null) => (ms === null ? DASH : `${Math.round(ms).toLocaleString()} ms`);

function ChatTiming({ stages, windowLabel }: { stages: Stages | null; windowLabel: string }) {
  // A null stage was not measured: it is left out of the bar, never drawn as 0.
  const present = stages === null ? [] : STAGES.flatMap((s) => {
    const ms = stages[s.key];
    return ms === null || ms <= 0 ? [] : [{ ...s, ms }];
  });
  const sum = present.reduce((total, s) => total + s.ms, 0);
  return (
    <section className={panelClass}>
      <PanelHeading icon={Sparkles} tone="rose" title="Chat timing" windowLabel={windowLabel} />
      <p className={`mt-1 text-xs ${labelText}`}>
        Only chat streams its answer, so only chat can be broken into stages. Every other feature reports total time only.
      </p>
      {stages === null || sum <= 0 ? (
        <p className={`py-6 text-sm ${labelText}`}>No streamed chat requests in this window, so there are no stage timings to show.</p>
      ) : (
        <>
          <div
            role="img"
            aria-label={`Chat time by stage, averaged over streamed requests: ${STAGES.map((s) => `${s.label} ${stageMs(stages[s.key])}`).join(", ")}`}
            className="mt-4 flex h-4 w-full overflow-hidden rounded bg-bg-warm"
          >
            {present.map((s) => (
              <div key={s.key} data-stage={s.key} style={{ width: `${(s.ms / sum) * 100}%`, backgroundColor: s.color }} />
            ))}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STAGES.map((s) => (
              <div key={s.key}>
                <dt className={`flex items-center gap-1.5 text-xs ${labelText}`}>
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.label}
                </dt>
                <dd className="text-sm font-semibold tabular-nums">{stageMs(stages[s.key])}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}

function BackgroundWork({ features, totalCostMicros }: { features: Feature[]; totalCostMicros: number }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const requests = features.reduce((total, f) => total + f.requests, 0);
  const cost = features.reduce((total, f) => total + f.costMicros, 0);
  return (
    <div>
      <section className={panelClass}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ChevronRight aria-hidden className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="font-semibold">Background work</span>
          <span className={`text-xs ${labelText}`}>
            — {features.length} {plural(features.length, "feature", "features")} · {requests.toLocaleString()}{" "}
            {plural(requests, "request", "requests")} · {usd(cost)}
          </span>
        </button>
        <div id={id} hidden={!open}>
          {features.length === 0 ? (
            <p className={`pt-4 text-sm ${labelText}`}>No background work in this window.</p>
          ) : (
            <FeatureTable label="Background work" features={features} totalCostMicros={totalCostMicros} />
          )}
        </div>
      </section>
      <p className={`mt-3 text-xs ${labelText}`}>
        Background work holds query-clarifier, thought-summary, chat-summarize, student-profile, warm-model and the six advising
        features, plus any feature not listed as student-facing. Closed by default because a student never asks for them.
      </p>
    </div>
  );
}

export function AiDetails({ report, days }: { report: AdminAiReport; days: number }) {
  const windowLabel = days === 1 ? "Last 1 day" : `Last ${days} days`;
  const { money } = report;
  const totalCost = money.costMicros;
  const student = report.features.filter((f) => isStudentFeature(f.feature)).sort(byCost);
  const background = report.features.filter((f) => !isStudentFeature(f.feature)).sort(byCost);
  const chat = report.features.find((f) => f.feature === "chat");

  if (hasNoSummaries(report.missingDays, days)) {
    return (
      <div className="space-y-6">
        <StaleBanner builtAt={report.builtAt} source={report.source} staleReason={report.staleReason} />
        <MissingDaysNotice missingDays={report.missingDays} days={days} />
        <NoSummaries />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StaleBanner builtAt={report.builtAt} source={report.source} staleReason={report.staleReason} />
      <MissingDaysNotice missingDays={report.missingDays} days={days} />
      <TruncatedNotice truncated={report.truncated} />
      <StudentFeatures features={student} totalCostMicros={totalCost} windowLabel={windowLabel} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Models models={report.models} windowLabel={windowLabel} />
          <PerDollar features={student} netCashMicros={money.netCashMicros} windowLabel={windowLabel} />
        </div>
        <Students students={report.students} costMicros={totalCost} days={days} />
      </div>
      <ChatTiming stages={chat?.stages ?? null} windowLabel={windowLabel} />
      <BackgroundWork features={background} totalCostMicros={totalCost} />
    </div>
  );
}

/** The Detailed analysis with its data, and a way back to the overview for the same window. */
export function AiDetailsScreen({ days }: { days: number }) {
  const { report, error, loading } = useAiReport(days);
  return (
    <div className="space-y-6">
      <Link
        href={`/admin/analytics/ai?days=${days}`}
        className="inline-block text-xs font-medium text-[#8a6539] underline underline-offset-2 hover:text-primary"
      >
        <span aria-hidden>← </span>Back to overview
      </Link>
      {loading ? (
        <Notice>Loading detailed analysis…</Notice>
      ) : error || !report ? (
        <Notice error>{error ?? "This report is temporarily unavailable."}</Notice>
      ) : (
        <AiDetails report={report} days={days} />
      )}
    </div>
  );
}
