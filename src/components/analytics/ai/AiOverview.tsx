"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CreditCard, ReceiptText, Sparkles, type LucideIcon } from "lucide-react";
import { isKnownFeature } from "@/src/library/billing/aiFeatures";
import type { AdminAiReport } from "@/src/library/billing/aiUsageReports";
import { Notice } from "../dashboardShared";
import { panelClass } from "../dashboardUtils";
import { AttentionCard } from "./AttentionCard";
import { CostDonut, type DonutSlice } from "./CostDonut";
import { formatShare, hasNoSummaries, percentileText, plural, shortDay, usd } from "./format";
import { MissingDaysNotice, NoSummaries, TruncatedNotice } from "./MissingDaysNotice";
import { DONUT_COLORS, labelText } from "./palette";
import { StaleBanner } from "./StaleBanner";
import { useAiReport } from "./useAiReport";

type Feature = AdminAiReport["features"][number];

/** The feature scoring highest, or null when none scores above zero. */
function top(features: Feature[], score: (f: Feature) => number | null): Feature | null {
  let best: Feature | null = null;
  let bestScore = 0;
  for (const f of features) {
    const s = score(f);
    if (s !== null && s > bestScore) {
      best = f;
      bestScore = s;
    }
  }
  return best;
}

function SectionHeading({ title, windowLabel }: { title: string; windowLabel: string }) {
  return (
    <h2 className="flex items-baseline gap-1.5 font-semibold">
      {title}
      <span className={`text-xs font-normal ${labelText}`}>· {windowLabel}</span>
    </h2>
  );
}

type BoxTone = "plain" | "kept" | "loss";
const boxTones: Record<BoxTone, { box: string; value: string; label: string; sub: string }> = {
  plain: { box: "", value: "text-text-main", label: "text-text-main", sub: labelText },
  // Tinted boxes fix their own text colours, so they read the same under every theme.
  kept: { box: "rounded-lg bg-[#fbf1e6] p-3", value: "text-[#3d3a34]", label: "text-[#3d3a34]", sub: "text-[#6b5a45]" },
  loss: { box: "rounded-lg bg-[#fbe9e8] p-3", value: "text-[#a3302a]", label: "text-[#a3302a]", sub: "text-[#a3302a]" },
};

/** `micros` null: no day in the window recorded the figure, so it is unknown rather than zero. */
function MoneyBox({ label, micros, sub, tone = "plain" }: { label: string; micros: number | null; sub: string; tone?: BoxTone }) {
  const t = boxTones[tone];
  return (
    <div data-money-box data-tone={tone} className={`flex flex-col ${t.box}`}>
      <dt className={`text-xs font-medium ${t.label}`}>{label}</dt>
      <dd className={`order-first text-2xl font-semibold tabular-nums tracking-tight ${t.value}`}>{micros === null ? "—" : usd(micros)}</dd>
      <dd className={`text-[11px] ${t.sub}`}>{sub}</dd>
    </div>
  );
}

const groupTones = {
  cash: { icon: CreditCard, chip: "bg-[#fbf1e6] text-[#8a6539]", title: "text-[#8a6539]" },
  credit: { icon: ReceiptText, chip: "bg-[#efedfc] text-[#4f43b8]", title: "text-[#4f43b8]" },
  ai: { icon: Sparkles, chip: "bg-[#fbe9e8] text-[#a3302a]", title: "text-[#a3302a]" },
} satisfies Record<string, { icon: LucideIcon; chip: string; title: string }>;

function MoneyGroup({ title, tone, children }: { title: string; tone: keyof typeof groupTones; children: ReactNode }) {
  const t = groupTones[tone];
  const Icon = t.icon;
  return (
    <div className="min-w-0 rounded-xl border border-border-light p-4">
      <div className="flex items-center gap-2">
        <span aria-hidden className={`flex h-7 w-7 items-center justify-center rounded-lg ${t.chip}`}>
          <Icon className="h-4 w-4" />
        </span>
        <h3 className={`text-sm font-medium ${t.title}`}>{title}</h3>
      </div>
      <dl className="mt-4 space-y-4">{children}</dl>
    </div>
  );
}

function CalmCard({ label, message }: { label: string; message: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-border-light bg-bg-warm p-4">
      <span className={`text-xs ${labelText}`}>{label}</span>
      <span className="mt-4 text-sm text-text-main">{message}</span>
    </div>
  );
}

export function AiOverview({ report, days }: { report: AdminAiReport; days: number }) {
  const windowLabel = days === 1 ? "Last 1 day" : `Last ${days} days`;
  const { money, features, missingDays } = report;
  const totalCost = money.costMicros;
  const unknown = report.total.unknownCostRows;
  // The endpoint refuses detail for a feature it does not list, so such a card gets no link.
  const featureHref = (f: Feature, view: "slow" | "cost" | "fail") =>
    isKnownFeature(f.feature) ? `/admin/analytics/ai/feature/${encodeURIComponent(f.feature)}?view=${view}&days=${days}` : null;

  if (hasNoSummaries(missingDays, days)) {
    return (
      <div className="space-y-6">
        <StaleBanner builtAt={report.builtAt} source={report.source} staleReason={report.staleReason} />
        <MissingDaysNotice missingDays={missingDays} days={days} />
        <NoSummaries />
      </div>
    );
  }

  // A p95 above the last bucket edge is at least that edge, so it outranks every p95 that has one.
  const slowest = top(features, (f) => (f.p95AboveMs !== null ? Infinity : f.p95Ms));
  const costliest = top(features, (f) => f.costMicros);
  const failing = top(features, (f) => f.errors);

  const ranked = features.filter((f) => f.costMicros > 0).sort((a, b) => b.costMicros - a.costMicros);
  const named = ranked.slice(0, 4);
  // Taken from the total, so the slices add up to the figure in the AI cost box exactly.
  const othersMicros = Math.max(0, totalCost - named.reduce((sum, f) => sum + f.costMicros, 0));
  const slices: DonutSlice[] = named.map((f, i) => ({ label: f.feature, micros: f.costMicros, color: DONUT_COLORS[i] }));
  if (othersMicros > 0) slices.push({ label: "All others", micros: othersMicros, color: DONUT_COLORS[4] });

  return (
    <div className="space-y-6">
      <StaleBanner builtAt={report.builtAt} source={report.source} staleReason={report.staleReason} />
      <MissingDaysNotice missingDays={missingDays} days={days} />
      <TruncatedNotice truncated={report.truncated} />

      <section className={panelClass}>
        <SectionHeading title="Money" windowLabel={windowLabel} />
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <MoneyGroup title="Cash" tone="cash">
            <MoneyBox label="Collected" micros={money.cashCollectedMicros} sub="What Stripe actually took" />
            <MoneyBox label="Refunded" micros={money.cashRefundedMicros} sub="Credit taken back on refunds and disputes" />
            <MoneyBox label="Net cash kept" micros={money.netCashMicros} sub="Collected minus credit taken back" tone="kept" />
          </MoneyGroup>
          <MoneyGroup title="Credit" tone="credit">
            <MoneyBox label="Credit granted" micros={money.creditGrantedMicros} sub="What students can spend" />
            <MoneyBox
              label="Unused balance" micros={money.unusedBalanceMicros}
              sub={money.unusedBalanceAsOf === null ? "Paid but not spent" : `Paid but not spent (as of ${shortDay(money.unusedBalanceAsOf)})`}
            />
            <MoneyBox label="Trial credit given" micros={money.trialGrantedMicros} sub="Free credit handed out" />
          </MoneyGroup>
          <MoneyGroup title="AI" tone="ai">
            <MoneyBox label="AI cost" micros={totalCost} sub="What providers billed you" />
            <MoneyBox label="Margin" micros={money.marginMicros} sub="Charged to students minus AI cost" />
            <MoneyBox label="Lost to failures" micros={money.creditRefundedMicros} sub="Refunded to students, still billed to you" tone="loss" />
          </MoneyGroup>
        </div>
        {unknown > 0 && (
          <p className={`mt-3 text-xs ${labelText}`}>
            {unknown.toLocaleString()} {plural(unknown, "request", "requests")} with unresolved cost{" "}
            {plural(unknown, "is", "are")} excluded from cost and margin.
          </p>
        )}
      </section>

      <section className={panelClass}>
        <SectionHeading title="Needs attention" windowLabel={windowLabel} />
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {slowest ? (
            <AttentionCard
              tone="slow" label="Slowest" feature={slowest.feature}
              value={percentileText(slowest.p95Ms, slowest.p95AboveMs)} context="worst case (p95, to bucket width)"
              href={featureHref(slowest, "slow")}
            />
          ) : (
            <CalmCard label="Slowest" message="No feature has enough timed requests yet" />
          )}
          {costliest ? (
            <AttentionCard
              tone="cost" label="Most expensive" feature={costliest.feature}
              value={usd(costliest.costMicros)} context={`${formatShare(costliest.costMicros, totalCost)} of AI spend`}
              href={featureHref(costliest, "cost")}
            />
          ) : (
            <CalmCard label="Most expensive" message="No AI spend in this window" />
          )}
          {failing ? (
            <AttentionCard
              tone="fail" label="Most failures" feature={failing.feature}
              value={`${failing.errors.toLocaleString()} / ${failing.requests.toLocaleString()}`} context="failed"
              href={featureHref(failing, "fail")}
            />
          ) : (
            <CalmCard label="Most failures" message="No failures in this window" />
          )}
        </div>
      </section>

      <section className={panelClass}>
        <SectionHeading title="Cost breakdown" windowLabel={windowLabel} />
        <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <CostDonut slices={slices} />
          <ul aria-label="Cost by feature" className="w-full min-w-0 divide-y divide-border-light rounded-xl border border-border-light text-sm">
            {slices.map((s) => (
              <li key={s.label} className="flex items-center gap-3 px-4 py-2.5">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                <span className={`tabular-nums ${labelText}`}>{formatShare(s.micros, totalCost)}</span>
                <span className="w-16 text-right font-semibold tabular-nums">{usd(s.micros)}</span>
              </li>
            ))}
            <li className="flex items-center gap-3 px-4 py-2.5 font-semibold">
              <span className="min-w-0 flex-1">Total</span>
              <span className="w-16 text-right tabular-nums">{usd(totalCost)}</span>
            </li>
          </ul>
        </div>
      </section>

      <p className={`text-xs ${labelText}`}>
        Full tables are on the next screen:{" "}
        <Link href={`/admin/analytics/ai/details?days=${days}`} className="text-text-main underline underline-offset-2 hover:text-primary">
          Detailed analysis
        </Link>
        .
      </p>
    </div>
  );
}

/** The Overview with its data: fetches the window's report and shows it, or why it cannot. */
export function AiOverviewScreen({ days }: { days: number }) {
  const { report, error, loading } = useAiReport(days);
  if (loading) return <Notice>Loading AI performance…</Notice>;
  if (error || !report) return <Notice error>{error ?? "This report is temporarily unavailable."}</Notice>;
  return <AiOverview report={report} days={days} />;
}
