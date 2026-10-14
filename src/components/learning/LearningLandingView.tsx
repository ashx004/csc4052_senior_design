import type { ReactNode } from "react";
import { BookOpen, CalendarCheck } from "lucide-react";
import type { StudyStreak } from "@/src/library/learning/streak";
import type { TodaysPick } from "@/src/library/learning/todaysPick";
import { LEARNING_ROUTES } from "@/src/library/learning/routes";
import StatCards from "@/src/components/studyPlan/StatCards";
import WeeklyChickenChart from "@/src/components/studyPlan/WeeklyChickenChart";
import FocusModeCard from "@/src/components/studyPlan/FocusModeCard";
import FireIcon from "./FireIcon";
import TodaysPickCard from "./TodaysPickCard";
import LearningDestinationCard from "./LearningDestinationCard";
import type { LearningStats } from "./LearningStatsStrip";

export type LearningLandingViewProps = {
  pick: TodaysPick | null;
  pickLoading: boolean;
  buddyMessage: string;
  onPickSomethingElse: () => void;
  onBuildPlan: () => void;
  streak: StudyStreak;
  streakLoading: boolean;
  streakError: string | null;
  stats: LearningStats;
  classCount?: number;
  classMasteryPercent?: number;
  classPips?: string[];
  planDoneCount?: number;
  planTotalCount?: number;
  planRemainingMinutes?: number;
  focusRecommendedMinutes: number;
  hasNextTask: boolean;
  focusDisabled: boolean;
  onStartNextTask: () => void;
  onPickTask: () => void;
  userId: string | null;
  firstName?: string;
  recentSets?: ReactNode;
};

/**
 * The `/learning` hub. Presentation only — every value arrives as a prop so
 * `LearningWorkspace` keeps all of the data loading.
 */
export default function LearningLandingView(props: LearningLandingViewProps) {
  const {
    pick,
    pickLoading,
    buddyMessage,
    onPickSomethingElse,
    onBuildPlan,
    streak,
    streakLoading,
    streakError,
    stats,
    classCount,
    classMasteryPercent,
    classPips,
    planDoneCount,
    planTotalCount,
    planRemainingMinutes,
    focusRecommendedMinutes,
    hasNextTask,
    focusDisabled,
    onStartNextTask,
    onPickTask,
    userId,
    firstName,
    recentSets,
  } = props;

  const classesMeta =
    classCount !== undefined && classMasteryPercent !== undefined
      ? `${classCount} ${classCount === 1 ? "class" : "classes"} · ${classMasteryPercent}% mastered`
      : undefined;

  const planMeta =
    planDoneCount !== undefined && planTotalCount !== undefined
      ? `${planDoneCount} of ${planTotalCount} tasks done${
          planRemainingMinutes !== undefined && planRemainingMinutes > 0
            ? ` · ${planRemainingMinutes} min left`
            : ""
        }`
      : undefined;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-[34px] font-extrabold leading-[1.1] tracking-[-0.02em] text-navy">
            {firstName ? `${greetingFor(new Date())}, ${firstName}` : greetingFor(new Date())}
          </h1>
          <p className="mt-2.5 text-base leading-relaxed text-gray-secondary">
            One thing at a time. Here is what is worth your next 20 minutes.
          </p>
        </div>
        <StreakPill streak={streak} loading={streakLoading} error={streakError} />
      </div>

      <div data-tutorial="learning-hero">
        <TodaysPickCard
          pick={pick}
          loading={pickLoading}
          buddyMessage={buddyMessage}
          onPickSomethingElse={onPickSomethingElse}
          onBuildPlan={onBuildPlan}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div data-tutorial="learning-classes">
          <LearningDestinationCard
            href={LEARNING_ROUTES.classes}
            icon={<BookOpen size={19} aria-hidden="true" />}
            title="Explore your classes"
            meta={classesMeta}
            pips={classPips}
            surfaceClassName="bg-card-lav"
            scribbleClassName="text-scrib-lav"
            pipBorderClassName="border-card-lav"
            notchClassName="shadow-[0_0_0_9px_var(--color-beige-canvas)]"
          />
        </div>
        <LearningDestinationCard
          href={LEARNING_ROUTES["study-plan"]}
          icon={<CalendarCheck size={19} aria-hidden="true" />}
          title="Start your study plan"
          meta={planMeta}
          surfaceClassName="bg-card-pea"
          scribbleClassName="text-scrib-pea"
          pipBorderClassName="border-card-pea"
          notchClassName="shadow-[0_0_0_9px_var(--color-beige-canvas)]"
        />
      </div>

      <div data-focus-row className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
        {/* WeeklyChickenChart returns null when it has no data. An empty wrapper
            is removed from layout by `empty:hidden`, so the focus card takes
            the whole row without this view needing to know why. */}
        <div data-chart-slot className="empty:hidden lg:flex-[1.75]">
          {userId !== null && <WeeklyChickenChart />}
        </div>
        <div className="lg:flex-1">
          <FocusModeCard
            recommendedMinutes={focusRecommendedMinutes}
            onStartNextTask={onStartNextTask}
            onPickTask={onPickTask}
            hasNextTask={hasNextTask}
            disabled={focusDisabled}
          />
        </div>
      </div>

      {recentSets !== null && recentSets !== undefined && (
        <section aria-labelledby="jump-back-in-heading">
          <h2 id="jump-back-in-heading" className="text-lg font-bold text-navy">
            Jump back in
          </h2>
          <div className="mt-4">{recentSets}</div>
        </section>
      )}

      <section aria-labelledby="week-at-a-glance-heading">
        <h2 id="week-at-a-glance-heading" className="mb-4 text-lg font-bold text-navy">
          Your week at a glance
        </h2>
        <StatCards
          streak={stats.streakDays}
          hoursThisWeek={stats.hoursThisWeek}
          topicsMastered={stats.topicsMastered}
          topicsTotal={stats.topicsTotal}
          dailyProgress={stats.dailyProgress}
        />
      </section>
    </div>
  );
}

function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function StreakPill({
  streak,
  loading,
  error,
}: {
  streak: StudyStreak;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="flex shrink-0 items-center gap-2 self-start rounded-full bg-beige-light px-4 py-2">
        <span className="h-5 w-24 rounded bg-gray-light motion-safe:animate-pulse" aria-hidden="true" />
        <span className="sr-only">Loading your study streak</span>
      </div>
    );
  }
  if (error) return null;
  if (streak.count < 1) return null;

  return (
    <p className="flex shrink-0 items-center gap-2 self-start rounded-full border border-gray-light bg-white px-4 py-2 text-sm font-bold text-navy">
      <FireIcon className="h-5 w-auto text-streak-flame" />
      <span aria-hidden="true">{streak.count} day streak</span>
      <span className="sr-only">{streak.count}-day study streak</span>
    </p>
  );
}
