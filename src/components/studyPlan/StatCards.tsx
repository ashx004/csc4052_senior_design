"use client";

interface StatCardsProps {
  streak: number;
  hoursThisWeek: number;
  topicsMastered: number;
  topicsTotal: number;
  dailyProgress: number;
}

interface Stat {
  label: string;
  value: string;
  unit: string;
  surface: string;
}

export default function StatCards({
  streak,
  hoursThisWeek,
  topicsMastered,
  topicsTotal,
  dailyProgress,
}: StatCardsProps) {
  const stats: Stat[] = [
    {
      label: "Current streak",
      value: String(streak),
      unit: streak === 1 ? "day" : "days",
      surface: "bg-beige-light",
    },
    {
      label: "Study time this week",
      value: hoursThisWeek.toFixed(1),
      unit: "hours",
      surface: "bg-accent-lavender",
    },
    {
      label: "Topics mastered",
      value: String(topicsMastered),
      unit: `/ ${topicsTotal}`,
      surface: "bg-accent-peach",
    },
    {
      label: "Today's progress",
      value: `${dailyProgress}%`,
      unit: "on track",
      surface: "bg-accent-sage",
    },
  ];

  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`rounded-xl p-5 ${stat.surface}`}
        >
          <dt className="text-xs font-medium text-gray-secondary">
            {stat.label}
          </dt>
          <dd className="mt-3 flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tabular-nums text-navy">
              {stat.value}
            </span>
            <span className="text-sm text-gray-secondary">{stat.unit}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
