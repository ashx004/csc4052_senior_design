"use client";

import Image from "next/image";
import {
  barHeight,
  formatDuration,
} from "@/src/library/studyPlan/weeklyRuler";

interface ChickenBarProps {
  date: string;
  minutes: number;
  hasStudy: boolean;
  isToday: boolean;
  isFuture: boolean;
  niceMax: number;
  weekday: string;
}

const MAX_BODY_HEIGHT = 140;
const BODY_WIDTH = 64;
const HEAD_WIDTH = 80;
const HEAD_HEIGHT = 80;
const HEAD_OVERLAP = 9;
const RESTING_BODY_HEIGHT = 6;

// The chicken head faces right (beak extends right), so the neck
// (flat bottom that sits on the body) is left of the PNG center.
// These offsets shift the head right so the neck aligns with the body.
// Measured from PNG pixel analysis: gray neck center at 46.7%, black at 50.3%.
const NECK_ALIGN = { gray:2.5, black: -0.5 } as const;

export default function ChickenBar({
  date,
  minutes,
  hasStudy,
  isToday,
  isFuture,
  niceMax,
  weekday,
}: ChickenBarProps) {
  const headSrc = hasStudy
    ? "/chicken_split_body_assets/chicken_black_head.png?v=3"
    : "/chicken_split_body_assets/chicken_gray_head.png?v=3";
  const bodySrc = hasStudy
    ? "/chicken_split_body_assets/chicken_black_body.png"
    : "/chicken_split_body_assets/chicken_gray_body.png";
  const bodyColor = hasStudy ? "#171716" : "#7C7A7A";
  const measuredBodyHeight = barHeight(minutes, niceMax, MAX_BODY_HEIGHT);
  const bodyHeight =
    measuredBodyHeight > 0 ? measuredBodyHeight : RESTING_BODY_HEIGHT;

  const d = new Date(`${date}T00:00:00`);
  const label = `${d.getMonth() + 1}.${d.getDate()}`;
  const neckOffset = hasStudy ? NECK_ALIGN.black : NECK_ALIGN.gray;
  const duration = minutes > 0 ? formatDuration(minutes) : "No study";
  const tooltipPosition =
    d.getDay() === 1
      ? "left-0 translate-x-0"
      : d.getDay() === 0
        ? "right-0 left-auto translate-x-0"
        : "left-1/2 -translate-x-1/2";

  if (isFuture) {
    return (
      <div className="flex min-w-[72px] flex-1 flex-col items-center">
        <div
          className="w-full"
          style={{ minHeight: MAX_BODY_HEIGHT + HEAD_HEIGHT }}
          aria-hidden
        />
        <div className="mt-1.5 flex flex-col items-center text-text-muted">
          <span className="text-[11px] font-medium">{weekday}</span>
          <span className="text-[11px] tabular-nums">{label}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group relative flex min-w-[72px] flex-1 flex-col items-center overflow-visible rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
      tabIndex={0}
      role="img"
      aria-label={`${weekday} ${label}: ${duration}`}
    >
      <div
        className="flex flex-col items-center justify-end overflow-visible"
        style={{ minHeight: MAX_BODY_HEIGHT + HEAD_HEIGHT }}
      >
        {/* Head — shifted right by neckOffset so the neck sits over the body */}
        <div
          className="relative z-[2]"
          style={{
            width: HEAD_WIDTH,
            height: HEAD_HEIGHT,
            marginBottom: -HEAD_OVERLAP,
            transform: neckOffset ? `translateX(${neckOffset}px)` : undefined,
          }}
        >
          <Image
            src={headSrc}
            alt=""
            aria-hidden
            width={300}
            height={273}
            className="block h-full w-full object-contain object-bottom"
            sizes="80px"
            unoptimized
          />
        </div>

        {/* Body bar */}
        <div
          className="relative overflow-hidden motion-reduce:transition-none"
          style={{
            width: BODY_WIDTH,
            height: bodyHeight,
            backgroundColor: bodyColor,
            borderRadius: "0 0 4px 4px",
            transition: "height 0.3s ease",
          }}
        >
          {measuredBodyHeight > 0 && (
            <Image
              src={bodySrc}
              alt=""
              aria-hidden
              fill
              className="object-fill"
              sizes="64px"
              unoptimized
            />
          )}
        </div>
      </div>

      <div
        className={`mt-1.5 flex flex-col items-center ${
          isToday ? "font-bold text-brown-label" : "text-gray-secondary"
        }`}
      >
        <span className="text-[11px]">{weekday}</span>
        <span className="text-[11px] tabular-nums">{label}</span>
      </div>

      <div
        role="tooltip"
        className={`pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-lg bg-navy px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none ${tooltipPosition}`}
      >
        {weekday} · {label} — {duration}
      </div>
    </div>
  );
}

export const CHICKEN_BAR_MAX_BODY = MAX_BODY_HEIGHT;
