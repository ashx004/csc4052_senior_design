import { formatUsd } from "@/src/library/billing/money";
import { formatShare } from "./format";
import { EMPTY_RING, labelText } from "./palette";

export type DonutSlice = { label: string; micros: number; color: string };

const RADIUS = 38;
const STROKE = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function CostDonut({ slices }: { slices: DonutSlice[] }) {
  const parts = slices.map((s) => ({ ...s, micros: Math.max(0, s.micros) }));
  const total = parts.reduce((sum, s) => sum + s.micros, 0);
  const description = `AI cost by feature, total ${formatUsd(total)}: ${parts
    .map((s) => `${s.label} ${formatShare(s.micros, total)}`)
    .join(", ")}`;

  let start = 0;
  const arcs = total > 0
    ? parts.flatMap((s) => {
        if (s.micros === 0) return [];
        const length = (s.micros / total) * CIRCUMFERENCE;
        const arc = { ...s, length, start };
        start += length;
        return [arc];
      })
    : [];

  return (
    <div role="img" aria-label={description} className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
        {arcs.length === 0 ? (
          <circle data-empty-ring cx="50" cy="50" r={RADIUS} fill="none" stroke={EMPTY_RING} strokeWidth={STROKE} />
        ) : (
          arcs.map((a, i) => (
            <circle
              key={`${i}-${a.label}`}
              data-slice
              cx="50" cy="50" r={RADIUS} fill="none"
              stroke={a.color}
              strokeWidth={STROKE}
              strokeDasharray={`${a.length} ${CIRCUMFERENCE - a.length}`}
              strokeDashoffset={-a.start}
            />
          ))
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xl font-semibold tabular-nums tracking-tight text-text-main">{formatUsd(total)}</span>
        <span className={`text-[11px] ${labelText}`}>Total AI cost</span>
      </div>
    </div>
  );
}
