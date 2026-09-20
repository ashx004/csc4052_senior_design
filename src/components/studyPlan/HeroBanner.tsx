"use client";

import { ArrowRight } from "lucide-react";

interface HeroBannerProps {
  hasPlan: boolean;
  onExploreClasses: () => void;
  onStartPlan: () => void;
}

function formatToday(): string {
  return new Date()
    .toLocaleDateString("en-US", { month: "long", day: "numeric" })
    .toUpperCase();
}

export default function HeroBanner({
  hasPlan,
  onExploreClasses,
  onStartPlan,
}: HeroBannerProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-navy px-6 py-7 sm:px-8">
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 right-16 h-64 w-64 text-white/10"
        viewBox="0 0 200 200"
        fill="none"
      >
        <circle cx="100" cy="100" r="99" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="70" stroke="currentColor" strokeWidth="1.5" />
      </svg>

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brown-label">
            Today · {formatToday()}
          </p>
          <h2 className="mt-2 text-xl font-bold text-white sm:text-2xl">
            {hasPlan
              ? "Your next best step is ready."
              : "What do you want to learn today?"}
          </h2>
          <p className="mt-2 text-sm text-white/70">
            {hasPlan
              ? "A calm, focused plan built from what matters most today."
              : "Start with a class, or use your study plan to protect your most important focus time."}
          </p>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onExploreClasses}
            className="rounded-full bg-white/15 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Explore classes
          </button>
          <button
            type="button"
            onClick={onStartPlan}
            className={`flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-navy transition-colors hover:bg-beige-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
              hasPlan ? "ring-2 ring-white ring-offset-2 ring-offset-navy" : ""
            }`}
          >
            Start study plan
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
