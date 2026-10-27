import type {
  FeatureStats,
  PerformanceReport,
} from "@/src/library/billing/aiPerformance";
import { Metric, Notice } from "./dashboardShared";
import { panelClass } from "./dashboardUtils";

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
/** costMicros are millionths of a dollar. */
export const formatCost = (micros: number) => {
  const text = dollars.format(micros / 1_000_000);
  // A real but tiny spend must not read as free.
  return micros > 0 && Number(text.replace(/[^0-9.]/g, "")) === 0
    ? "<$0.0001"
    : text;
};
const formatMs = (ms: number | null) =>
  ms === null ? "—" : `${Math.round(ms).toLocaleString()} ms`;
const formatRate = (rate: number) => `${(rate * 100).toFixed(1)}%`;

type Stages = NonNullable<FeatureStats["stages"]>;
const segments: { key: keyof Stages; label: string; color: string }[] = [
  { key: "waitMs", label: "Waiting", color: "bg-text-muted" },
  { key: "genMs", label: "Generating", color: "bg-primary" },
  { key: "overheadMs", label: "Other (incl. retries)", color: "bg-accent-peach" },
  { key: "deliverMs", label: "Delivery", color: "bg-accent-sage" },
];

function StageBar({ stages }: { stages: Stages }) {
  // A null stage was not measured: it is left out, never drawn as 0.
  const present = segments.flatMap((s) => {
    const ms = stages[s.key];
    return ms === null || ms <= 0 ? [] : [{ ...s, ms }];
  });
  const sum = present.reduce((total, s) => total + s.ms, 0);
  if (sum <= 0)
    return <span className="text-xs text-text-muted">No stage time recorded</span>;
  return (
    <div>
      <div
        aria-hidden
        className="flex h-2 w-full overflow-hidden rounded-full bg-bg-warm"
      >
        {present.map((s) => (
          <div
            key={s.key}
            data-stage={s.key}
            title={`${s.label}: ${formatMs(s.ms)}`}
            className={s.color}
            style={{ width: `${(s.ms / sum) * 100}%` }}
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-text-muted">
        Average split across streamed requests:{" "}
        {present.map((s) => `${s.label} ${formatMs(s.ms)}`).join(" · ")}
      </p>
    </div>
  );
}

export function AnalyticsPerformance({
  report,
  days = 7,
}: {
  report: PerformanceReport;
  days?: number;
}) {
  const windowLabel = days === 1 ? "Last 1 day" : `Last ${days} days`;
  const { total } = report;
  const tokens = total.inputTokens + total.outputTokens;
  return (
    <div className="space-y-6">
      {report.truncated && (
        <Notice error>
          These figures are partial: the record limit was reached, so older
          requests in this window are not counted.
        </Notice>
      )}
      <div className="grid divide-y divide-border-light overflow-hidden rounded-2xl border border-border-light bg-bg-container sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4">
        <Metric label="Requests" value={total.requests} detail={`AI requests · ${windowLabel.toLowerCase()}`} />
        <Metric
          label="Error rate"
          value={
            total.requests === 0 ? null : formatRate(total.errors / total.requests)
          }
          detail={`${total.errors.toLocaleString()} failed requests`}
        />
        <Metric
          label="Tokens"
          value={tokens}
          detail={`${total.inputTokens.toLocaleString()} in · ${total.outputTokens.toLocaleString()} out`}
        />
        <Metric
          label="Billed cost"
          value={formatCost(total.costMicros)}
          detail="Excludes free local and failed requests"
        />
      </div>
      <section className={panelClass}>
        <h2 className="font-semibold">AI features · {windowLabel}</h2>
        <p className="mt-1 text-sm leading-relaxed text-text-muted">
          Typical is the median and worst case the 95th percentile, from
          completed requests. A dash means fewer than 5 timed requests.
        </p>
        {report.features.length === 0 ? (
          <p className="py-8 text-sm text-text-muted">
            No AI requests have been recorded in this window.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-light text-xs text-text-muted">
                  {["Feature", "Requests", "Typical (p50)", "Worst case (p95)", "Error rate", "Tokens in / out", "Cost"].map((name) => (
                    <th className="p-3 font-medium" key={name}>{name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.features.map((f) => (
                  <FeatureRows key={f.feature} f={f} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function FeatureRows({ f }: { f: FeatureStats }) {
  return (
    <>
      <tr>
        <td className="p-3 font-medium">{f.feature}</td>
        <td className="p-3 tabular-nums">
          {f.requests.toLocaleString()}
          {f.localRequests > 0 && (
            <p className="text-xs text-text-muted">
              {f.localRequests.toLocaleString()} of {f.requests.toLocaleString()} free local calls
            </p>
          )}
        </td>
        <td className="whitespace-nowrap p-3 tabular-nums">{formatMs(f.p50Ms)}</td>
        <td className="whitespace-nowrap p-3 tabular-nums">{formatMs(f.p95Ms)}</td>
        <td className="p-3 tabular-nums">{formatRate(f.errorRate)}</td>
        <td className="whitespace-nowrap p-3 tabular-nums">
          {f.inputTokens.toLocaleString()} / {f.outputTokens.toLocaleString()}
        </td>
        <td className="p-3 tabular-nums">{formatCost(f.costMicros)}</td>
      </tr>
      <tr className="border-b border-border-light last:border-0">
        <td className="px-3 pb-3" colSpan={7}>
          {f.stages === null ? (
            <span className="text-xs text-text-muted">total only</span>
          ) : (
            <StageBar stages={f.stages} />
          )}
        </td>
      </tr>
    </>
  );
}
