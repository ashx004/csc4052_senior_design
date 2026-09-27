"use client";

import { useAuth } from "@/src/context/AuthContext";
import { useWeeklyStudyData } from "@/src/hooks/useWeeklyStudyData";
import {
  computeRuler,
  formatDuration,
} from "@/src/library/studyPlan/weeklyRuler";
import ChickenBar, { CHICKEN_BAR_MAX_BODY } from "./ChickenBar";

const RULER_BASELINE_OFFSET = 39;

function formatDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function WeeklyChickenChart() {
  const { user } = useAuth();
  const { dailyMinutes, dailyAverage, loading, error, retry } = useWeeklyStudyData(
    user?.uid ?? null
  );

  if (!user) return null;

  if (loading) {
    return (
      <div
        className="h-72 animate-pulse rounded-[20px] bg-white shadow-[0_8px_30px_rgba(26,26,48,0.06)]"
        aria-hidden
      />
    );
  }

  if (error) {
    return (
      <div className="rounded-[20px] border border-gray-light bg-white p-5 shadow-[0_8px_30px_rgba(26,26,48,0.06)]">
        <h3 className="text-lg font-bold italic text-navy">Recent Focus</h3>
        <p className="mt-2 text-sm text-gray-secondary" role="alert">
          {error}
        </p>
        <button
          type="button"
          onClick={retry}
          className="mt-3 min-h-11 rounded-[10px] bg-navy px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
        >
          Try again
        </button>
      </div>
    );
  }

  if (dailyMinutes.length === 0) return null;

  const { niceMax, ticks } = computeRuler(
    dailyMinutes.map((day) => day.minutes)
  );

  const summary = dailyMinutes
    .map((day) => `${formatDay(day.date)}: ${formatDuration(day.minutes)}`)
    .join(", ");

  return (
    <section
      aria-label={`Recent focus. Daily average ${formatDuration(dailyAverage)}. ${summary}`}
      className="rounded-[20px] border border-gray-light bg-white p-5 shadow-[0_8px_30px_rgba(26,26,48,0.06)]"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-lg font-bold italic text-navy">Recent Focus</h3>
        <div className="text-right">
          <span className="text-xs text-gray-secondary">Daily Average</span>
          <p className="text-[22px] font-extrabold tabular-nums leading-none text-navy">
            {formatDuration(dailyAverage)}
          </p>
        </div>
      </div>

      <div className="relative mt-4">
        <div className="pointer-events-none absolute bottom-0 left-8 right-0 top-0 z-0" aria-hidden>
          {ticks.map((tick) => {
            const bottom =
              RULER_BASELINE_OFFSET +
              Math.round((tick.minutes / niceMax) * CHICKEN_BAR_MAX_BODY);
            return (
              <div
                key={tick.minutes}
                className="absolute left-0 right-0 border-t border-gray-light/70"
                style={{ bottom }}
              >
                <span className="absolute right-full top-0 mr-2 -translate-y-1/2 text-[10px] font-medium tabular-nums text-gray-secondary">
                  {tick.label}
                </span>
              </div>
            );
          })}
        </div>

        <div className="relative z-[1] ml-8 flex items-end overflow-visible" style={{ gap: 8 }}>
          {dailyMinutes.map((d) => (
            <ChickenBar
              key={d.date}
              date={d.date}
              minutes={d.minutes}
              hasStudy={d.hasStudy}
              isToday={d.isToday}
              isFuture={d.isFuture}
              niceMax={niceMax}
              weekday={new Date(`${d.date}T00:00:00`).toLocaleDateString(
                undefined,
                { weekday: "short" }
              )}
            />
          ))}
        </div>
      </div>

      <details className="mt-4 text-sm text-gray-secondary">
        <summary className="cursor-pointer rounded-md py-1 font-medium text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">
          View daily totals
        </summary>
        <table className="mt-2 w-full text-left text-sm">
          <caption className="sr-only">Minutes studied each day this week</caption>
          <thead>
            <tr className="text-xs text-gray-secondary">
              <th scope="col" className="py-1 font-medium">Day</th>
              <th scope="col" className="py-1 text-right font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {dailyMinutes.map((day) => (
              <tr key={day.date} className="border-t border-gray-light">
                <th scope="row" className="py-1.5 font-normal text-navy">
                  {formatDay(day.date)}
                  {day.isToday ? " (today)" : ""}
                </th>
                <td className="py-1.5 text-right tabular-nums text-navy">
                  {formatDuration(day.minutes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
