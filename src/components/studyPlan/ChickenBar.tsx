"use client";

import Image from "next/image";

interface ChickenBarProps {
  date: string;
  minutes: number;
  maxMinutes: number;
  dailyAverage: number;
  isToday: boolean;
}

const MAX_BODY_HEIGHT = 140;
const BODY_WIDTH = 64;
const HEAD_WIDTH = 80;
const HEAD_HEIGHT = 80;
const HEAD_OVERLAP = 9;

// The chicken head faces right (beak extends right), so the neck
// (flat bottom that sits on the body) is left of the PNG center.
// These offsets shift the head right so the neck aligns with the body.
// Measured from PNG pixel analysis: gray neck center at 46.7%, black at 50.3%.
const NECK_ALIGN = { gray:2.5, black: -0.5 } as const;

export default function ChickenBar({
  date,
  minutes,
  maxMinutes,
  dailyAverage,
  isToday,
}: ChickenBarProps) {
  const isAboveAvg = minutes >= dailyAverage && minutes > 0;
  const isZero = minutes === 0;

  const headSrc = isAboveAvg
    ? "/chicken_split_body_assets/chicken_black_head.png?v=3"
    : "/chicken_split_body_assets/chicken_gray_head.png?v=3";

  const bodyColor = isAboveAvg ? "#171716" : "#7C7A7A";
  const bodyHeight = isZero
    ? 28
    : maxMinutes > 0
      ? Math.max(32, Math.round((minutes / maxMinutes) * MAX_BODY_HEIGHT))
      : 28;

  const d = new Date(`${date}T00:00:00`);
  const label = `${d.getMonth() + 1}.${d.getDate()}`;
  const dateLabelColor = isToday ? "#8A6840" : isZero ? "#6B7280" : "#54555C";
  const neckOffset = isAboveAvg ? NECK_ALIGN.black : NECK_ALIGN.gray;

  return (
    <div className="flex min-w-[72px] flex-1 flex-col items-center overflow-visible">
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
          {isToday && minutes > 0 && (
            <span className="absolute -right-1 top-0 rounded-full bg-navy px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
              {minutes}
            </span>
          )}
        </div>

        {/* Body bar */}
        <div
          className="motion-reduce:transition-none"
          style={{
            width: BODY_WIDTH,
            height: bodyHeight,
            backgroundColor: bodyColor,
            borderRadius: "0 0 4px 4px",
            transition: "height 0.3s ease",
          }}
        />
      </div>

      <span
        className="mt-1.5 text-[11px] tabular-nums"
        style={{ color: dateLabelColor, fontWeight: isToday ? 700 : 400 }}
      >
        {label}
      </span>
    </div>
  );
}

export const CHICKEN_BAR_MAX_BODY = MAX_BODY_HEIGHT;
