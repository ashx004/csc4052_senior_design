import Link from "next/link";
import Image from "next/image";
import { BookOpen, Clock, Play } from "lucide-react";
import type { TodaysPick } from "@/src/library/learning/todaysPick";

const MASCOT = "/chicken_png_assets/sheet2/09_happy_wings.png";
const RING_RADIUS = 32;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * The landing page's one bold thing: the single next action, with the study
 * buddy above it. It merges what used to be two competing cards — "Continue
 * where you left off" and a recommendation — because only one of them can be
 * the primary action.
 */
export default function TodaysPickCard({
  pick,
  buddyMessage,
  loading = false,
  onPickSomethingElse,
  onBuildPlan,
}: {
  pick: TodaysPick | null;
  buddyMessage: string;
  loading?: boolean;
  onPickSomethingElse?: () => void;
  onBuildPlan?: () => void;
}) {
  return (
    <section className="rounded-[28px] bg-buddy-bg p-6" aria-labelledby="todays-pick-heading">
      <div className="flex items-center gap-5 px-1 pb-5">
        <span className="grid h-[86px] w-[86px] shrink-0 place-items-center rounded-full bg-white shadow-[0_1px_3px_rgba(31,43,71,.08)]">
          <Image src={MASCOT} alt="" aria-hidden width={62} height={62} className="object-contain" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-buddy-label">Your study buddy</p>
          <p className="mt-1 text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-navy">
            {buddyMessage}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-[22px] bg-white p-6" role="status">
          <span className="block h-6 w-2/3 rounded bg-gray-light motion-safe:animate-pulse" aria-hidden />
          <span id="todays-pick-heading" className="sr-only">Loading today&apos;s pick</span>
        </div>
      ) : pick ? (
        <PickBody pick={pick} />
      ) : (
        <div className="rounded-[22px] bg-white p-6">
          <h2 id="todays-pick-heading" className="text-xl font-bold text-navy">
            Nothing queued yet
          </h2>
          <p className="mt-1 text-sm text-buddy-label">
            Build a plan and your next step shows up here.
          </p>
          <button
            type="button"
            onClick={onBuildPlan}
            className="mt-4 rounded-full bg-navy px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-navy/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy motion-reduce:transition-none"
          >
            Build today&apos;s plan
          </button>
        </div>
      )}

      {pick && !loading && onPickSomethingElse && (
        <button
          type="button"
          onClick={onPickSomethingElse}
          className="mt-3.5 px-1 text-[13px] font-semibold text-buddy-label transition-colors hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy motion-reduce:transition-none"
        >
          Pick something else
        </button>
      )}
    </section>
  );
}

function PickBody({ pick }: { pick: TodaysPick }) {
  const { title, lessonCount, remainingMinutes, percent, href } = pick;
  return (
    <div className="flex flex-wrap items-center gap-6 rounded-[22px] bg-white px-6 py-5">
      <div className="min-w-0 flex-1 basis-60">
        <h2 id="todays-pick-heading" className="text-[21px] font-bold leading-snug text-navy">
          Today&apos;s pick: {title}
        </h2>
        {(lessonCount !== undefined || remainingMinutes !== undefined) && (
          <p className="mt-2 flex flex-wrap gap-5 text-sm text-buddy-label">
            {lessonCount !== undefined && (
              <span className="inline-flex items-center gap-2">
                <BookOpen size={16} aria-hidden="true" />
                {lessonCount} {lessonCount === 1 ? "lesson" : "lessons"}
              </span>
            )}
            {remainingMinutes !== undefined && (
              <span className="inline-flex items-center gap-2">
                <Clock size={16} aria-hidden="true" />
                {remainingMinutes} min
              </span>
            )}
          </p>
        )}
      </div>

      <div className="ml-auto flex items-center gap-5">
        {percent !== undefined && (
          <p className="whitespace-nowrap text-base font-bold text-navy">
            <span>{percent}%</span> <span className="font-semibold text-buddy-muted">complete</span>
          </p>
        )}
        <Link
          href={href}
          aria-label={`Start today's pick: ${title}`}
          className="relative grid h-[70px] w-[70px] shrink-0 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-navy"
        >
          {percent !== undefined && (
            <svg
              data-progress-ring
              width="70"
              height="70"
              viewBox="0 0 70 70"
              aria-hidden="true"
              className="absolute inset-0 -rotate-90"
            >
              <circle cx="35" cy="35" r={RING_RADIUS} fill="none" className="stroke-buddy-track" strokeWidth="4" />
              <circle
                cx="35"
                cy="35"
                r={RING_RADIUS}
                fill="none"
                className="stroke-navy"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE * (1 - percent / 100)}
              />
            </svg>
          )}
          <span className="grid h-[56px] w-[56px] place-items-center rounded-full bg-white text-buddy-blue transition-colors hover:bg-buddy-hover motion-reduce:transition-none">
            <Play size={18} fill="currentColor" strokeWidth={0} aria-hidden="true" />
          </span>
        </Link>
      </div>
    </div>
  );
}
