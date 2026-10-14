import { parseGradingBreakdown } from "@/src/library/gradingBreakdown";

// Drawn from the app's own palette (gold primary, navy, sage, coral, brown, ...)
// via theme variables so it follows light/dark. Each slice also appears in the
// legend with its name and percentage, so colour is never the only cue.
const COLORS = [
  "var(--color-primary)",
  "var(--color-navy, #1A1A30)",
  "var(--color-alert-success)",
  "var(--color-alert-error)",
  "var(--color-brown-label, #B49080)",
  "var(--color-text-muted)",
  "var(--color-border-hover)",
  "var(--color-gray-secondary, #54555C)",
];
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
