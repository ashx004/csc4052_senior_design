"use client";

import Image from "next/image";
import { CHICKEN_SPRITES } from "@/src/library/studyPlan/chickenConfig";
import type { ChickenState } from "@/src/library/studyPlan/types";

const SIZE_MAP = {
  expanded: { width: 100, height: 100 },
  minimized: { width: 80, height: 80 },
  chart: { width: 80, height: 80 },
} as const;

interface ChickenAvatarProps {
  state: ChickenState;
  size: "expanded" | "minimized" | "chart";
  className?: string;
}

export default function ChickenAvatar({
  state,
  size,
  className = "",
}: ChickenAvatarProps) {
  const spriteSrc =
    state === "paused" ? CHICKEN_SPRITES.growing : CHICKEN_SPRITES[state];
  const dimensions = SIZE_MAP[size];
  const decorative = size === "minimized";

  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${className}`}>
      <Image
        src={spriteSrc}
        alt={decorative ? "" : `Chicken ${state}`}
        aria-hidden={decorative ? true : undefined}
        width={dimensions.width}
        height={dimensions.height}
        className={`object-contain ${state === "paused" ? "opacity-40" : ""}`}
        priority={size !== "chart"}
      />
    </span>
  );
}
