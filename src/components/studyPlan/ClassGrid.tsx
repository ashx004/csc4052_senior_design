"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, GraduationCap } from "lucide-react";

export interface EnrolledClass {
  id: string;
  classCode: string;
  className: string;
  term: string;
  /** 0-100 completion for the card's progress bar. */
  progress?: number;
}

interface ClassGridProps {
  classes: EnrolledClass[];
  onClassClick: (id: string) => void;
}

const accents = [
  "bg-accent-lavender",
  "bg-accent-peach",
  "bg-accent-sage",
  "bg-beige-canvas",
];

const masteryStyles = {
  notStarted: { label: "Start here", dot: "bg-[#F29B7E]", text: "text-[#A84D35]" },
  needsPractice: { label: "Needs practice", dot: "bg-[#F29B7E]", text: "text-[#A84D35]" },
  building: { label: "Building momentum", dot: "bg-[#F5C96B]", text: "text-[#8B6914]" },
  onTrack: { label: "On track", dot: "bg-[#62A67B]", text: "text-[#39704E]" },
  mastered: { label: "Mastered", dot: "bg-[#7774D6]", text: "text-[#4E4B9E]" },
} as const;

function getMasteryStyle(progress?: number) {
  if (!progress) return masteryStyles.notStarted;
  if (progress < 50) return masteryStyles.needsPractice;
  if (progress < 70) return masteryStyles.building;
  if (progress < 90) return masteryStyles.onTrack;
  return masteryStyles.mastered;
}

type Layout = "cards" | "list";

export default function ClassGrid({ classes, onClassClick }: ClassGridProps) {
  const [layout, setLayout] = useState<Layout>("cards");

  return (
    <section className="rounded-2xl bg-white p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-navy">Course mastery</h3>
          <p className="mt-1 text-xs text-gray-secondary">Build confidence one concept at a time.</p>
        </div>

        <div className="flex items-center gap-1 rounded-full bg-gray-input p-1">
          {(["cards", "list"] as Layout[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setLayout(option)}
              aria-pressed={layout === option}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${
                layout === option
                  ? "bg-navy text-white"
                  : "text-gray-secondary hover:text-navy"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {classes.length === 0 ? (
        <div className="py-12 text-center">
          <GraduationCap
            size={32}
            className="mx-auto mb-3 text-brown-label"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-navy">
            No classes enrolled yet.
          </p>
          <p className="mt-1 text-sm text-gray-secondary">
            Add a class to start building your plan.
          </p>
          <Link
            href="/classes"
            className="mt-4 inline-block rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Go to Classes
          </Link>
        </div>
      ) : layout === "cards" ? (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {classes.map((cls, index) => (
            <button
              key={cls.id}
              type="button"
              onClick={() => onClassClick(cls.id)}
              className={`group flex min-h-[176px] cursor-pointer flex-col rounded-2xl p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${
                accents[index % accents.length]
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="max-w-[85%] text-[15px] font-bold leading-snug text-navy">
                  {cls.className || "Untitled class"}
                </h4>
                <ArrowUpRight
                  size={16}
                  className="flex-shrink-0 text-navy/60 transition-colors group-hover:text-navy"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-1 text-xs text-gray-secondary">
                {[cls.classCode, cls.term].filter(Boolean).join(" · ")}
              </p>
              <div className="mt-5 flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${getMasteryStyle(cls.progress).text}`}>
                  <span className={`h-2 w-2 rounded-full ${getMasteryStyle(cls.progress).dot}`} aria-hidden="true" />
                  {getMasteryStyle(cls.progress).label}
                </span>
                {cls.progress !== undefined && <span className="text-[11px] text-gray-secondary">{cls.progress}%</span>}
              </div>
              <div className="mt-auto h-1.5 w-full overflow-hidden rounded-full bg-white/60">
                <div
                  className="h-full rounded-full bg-navy"
                  style={{
                    width: `${Math.min(100, Math.max(0, cls.progress ?? 0))}%`,
                  }}
                />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-gray-light">
          {classes.map((cls) => (
            <li key={cls.id}>
              <button
                type="button"
                onClick={() => onClassClick(cls.id)}
                className="flex w-full items-center justify-between gap-3 py-3 text-left transition-colors hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
              >
                <span>
                  <span className="block text-sm font-semibold text-navy">
                    {cls.className || "Untitled class"}
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-secondary">
                    {[cls.classCode, cls.term].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <ArrowUpRight
                  size={16}
                  className="flex-shrink-0 text-gray-secondary"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
