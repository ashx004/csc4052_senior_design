import { panelClass } from "../dashboardUtils";
import { plural, shortDay } from "./format";
import { labelText } from "./palette";

/** Window days with no summary document, named so they never pass for days with zero requests. */
export function MissingDaysNotice({ missingDays, days }: { missingDays: string[]; days: number }) {
  if (missingDays.length === 0) return null;
  return (
    <p className="rounded-xl border border-[#f0dfca] bg-[#fbf1e6] px-4 py-3 text-sm text-[#3d3a34]">
      {missingDays.length} of {days} {plural(days, "day", "days")}{" "}
      {plural(missingDays.length, "has", "have")} no data yet (nightly summary not built):{" "}
      {missingDays.map(shortDay).join(", ")}.
    </p>
  );
}

/** Shown instead of a screen of zeros when every window day is missing (`hasNoSummaries`). */
export function NoSummaries() {
  return (
    <section className={panelClass}>
      <p className={`text-sm ${labelText}`}>No nightly summaries for this window yet.</p>
    </section>
  );
}

/** A day that hit the nightly build's row cap holds only part of that day's requests. */
export function TruncatedNotice({ truncated }: { truncated: boolean }) {
  if (!truncated) return null;
  return (
    <p className="rounded-xl border border-[#f0dfca] bg-[#fbf1e6] px-4 py-3 text-sm text-[#3d3a34]">
      Some days hit the 20,000-request cap; figures for those days are partial.
    </p>
  );
}
