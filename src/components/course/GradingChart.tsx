import { parseGradingBreakdown } from "@/src/library/gradingBreakdown";

// Distinct without relying on the theme: each slice also appears in the legend
// with its name and percentage, so colour is never the only cue.
const COLORS = ["#2563eb", "#d97706", "#16a34a", "#9333ea", "#dc2626", "#0891b2", "#ca8a04", "#db2777"];
const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** The course's grade weights as a donut chart with a legend. Falls back to the plain text when it can't be read as weights. */
export default function GradingChart({ grading }: { grading: string }) {
  const slices = parseGradingBreakdown(grading);
  if (!slices) return <p className="mt-0.5 text-text-main">{grading}</p>;

  const total = slices.reduce((sum, slice) => sum + slice.percent, 0);
  let offset = 0;
  return (
    <div className="mt-2 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0 -rotate-90" role="img" aria-label={`Grade breakdown: ${slices.map((s) => `${s.label} ${s.percent}%`).join(", ")}`}>
        {slices.map((slice, index) => {
          const length = (slice.percent / total) * CIRCUMFERENCE;
          const circle = (
            <circle
              key={slice.label + index}
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              stroke={COLORS[index % COLORS.length]}
              strokeWidth="16"
              strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
              strokeDashoffset={-offset}
            />
          );
          offset += length;
          return circle;
        })}
      </svg>
      <ul className="grid flex-1 gap-1.5 text-sm">
        {slices.map((slice, index) => (
          <li key={slice.label + index} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: COLORS[index % COLORS.length] }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-text-main">{slice.label}</span>
            <span className="tabular-nums text-text-muted">{slice.percent}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
