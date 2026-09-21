"use client";

import { useState } from "react";
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
  const [activeMode, setActiveMode] = useState<"plan" | "explore">(
    hasPlan ? "plan" : "explore"
  );

  const showPlanText = activeMode === "plan";

  return (
    <section className="relative overflow-hidden rounded-[22px] bg-navy px-6 py-8 shadow-[0_18px_50px_rgba(26,26,48,.08)] sm:px-8 sm:py-9">
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-28 h-[22rem] w-[22rem] text-white/10"
        viewBox="0 0 200 200"
        fill="none"
      >
        <circle cx="100" cy="100" r="99" stroke="currentColor" strokeWidth="1" />
        <circle cx="100" cy="100" r="72" stroke="currentColor" strokeWidth="1" />
      </svg>

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brown-label">
            Today · {formatToday()}
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-[-0.05em] text-white sm:text-[28px]">
            {showPlanText
              ? "Your next best step is ready."
              : "What do you want to learn today?"}
          </h2>
          <p className="mt-2 text-sm text-white/70">
            {showPlanText
              ? "A calm, focused plan built from what matters most today."
              : "Start with a class, or use your study plan to protect your most important focus time."}
          </p>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setActiveMode("explore");
              onExploreClasses();
            }}
            className={`cursor-pointer rounded-[11px] px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
              activeMode === "explore"
                ? "bg-white text-navy hover:bg-beige-light"
                : "bg-white/15 text-white hover:bg-white/25"
            }`}
          >
            Explore classes
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveMode("plan");
              onStartPlan();
            }}
            className={`flex cursor-pointer items-center gap-2 rounded-[11px] px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
              activeMode === "plan"
                ? "bg-white text-navy hover:bg-beige-light ring-2 ring-white ring-offset-2 ring-offset-navy"
                : "bg-white/15 text-white hover:bg-white/25"
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
