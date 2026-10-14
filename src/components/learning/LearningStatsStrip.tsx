export type LearningStats = {
  streakDays: number;
  hoursThisWeek: number;
  topicsMastered: number;
  topicsTotal: number;
  dailyProgress: number;
};

type Entry = { label: string; value: string; unit: string; skeleton: boolean };

/**
 * The four numbers the old four-tile `StatCards` block showed, compressed into
 * one row so the landing page leads with its destinations instead of metrics.
 * The labels are unchanged on purpose — the student already knows them.
 *
 * Only the streak value can be pending: it comes from a live Firestore
 * subscription. The other three are derived from tasks already in memory.
 */
export default function LearningStatsStrip({
  stats,
  loading,
}: {
  stats: LearningStats;
  loading: boolean;
}) {
  const entries: Entry[] = [
    {
      label: "Current streak",
      value: String(stats.streakDays),
      unit: stats.streakDays === 1 ? "day" : "days",
      skeleton: loading,
    },
    {
      label: "Study time this week",
      value: stats.hoursThisWeek.toFixed(1),
      unit: "hours",
      skeleton: false,
    },
    {
      label: "Topics mastered",
      value: String(stats.topicsMastered),
      unit: `/ ${stats.topicsTotal}`,
      skeleton: false,
    },
    {
      label: "Today's progress",
      value: `${stats.dailyProgress}%`,
      unit: "on track",
      skeleton: false,
    },
  ];

  return (
    <section
      role="group"
      aria-labelledby="learning-glance-heading"
      className="rounded-2xl bg-beige-light p-5 sm:px-6"
    >
      <h2
        id="learning-glance-heading"
        className="text-xs font-semibold uppercase tracking-[0.08em] text-brown-label"
      >
        Your week at a glance
      </h2>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
        {entries.map((entry) => (
          <div key={entry.label} className="min-w-0">
            <dt className="truncate text-xs font-medium text-gray-secondary">{entry.label}</dt>
            <dd className="mt-1 flex items-baseline gap-1.5">
              {entry.skeleton ? (
                <>
                  <span
                    className="h-7 w-10 rounded bg-gray-light motion-safe:animate-pulse"
                    aria-hidden="true"
                  />
                  <span className="sr-only">Loading</span>
                </>
              ) : (
                <span className="text-2xl font-bold tabular-nums text-navy">{entry.value}</span>
              )}
              <span className="text-sm text-gray-secondary">{entry.unit}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
