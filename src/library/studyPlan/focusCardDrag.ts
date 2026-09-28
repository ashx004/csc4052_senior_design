import type { CardCorner } from "@/src/library/studyPlan/types";

export const CORNER_INSET_PX = 12;
export const CORNER_ZONE_FRACTION = 0.3;

export interface ViewportSize {
  width: number;
  height: number;
}

export interface CardSize {
  width: number;
  height: number;
}

function inset(edge: "top" | "right" | "bottom" | "left"): string {
  return `max(${CORNER_INSET_PX}px, env(safe-area-inset-${edge}))`;
}

export function cornerZoneAt(x: number, y: number, viewport: ViewportSize): CardCorner | null {
  const nearX = x <= viewport.width * CORNER_ZONE_FRACTION;
  const farX = x >= viewport.width * (1 - CORNER_ZONE_FRACTION);
  const nearY = y <= viewport.height * CORNER_ZONE_FRACTION;
  const farY = y >= viewport.height * (1 - CORNER_ZONE_FRACTION);
  if (nearX && nearY) return "top-left";
  if (farX && nearY) return "top-right";
  if (nearX && farY) return "bottom-left";
  if (farX && farY) return "bottom-right";
  return null;
}

export function resolveDropCorner(
  point: { x: number; y: number },
  viewport: ViewportSize,
  current: CardCorner
): CardCorner {
  return cornerZoneAt(point.x, point.y, viewport) ?? current;
}

export function cornerFrame(corner: CardCorner, card: CardSize): { top: string; left: string } {
  const top = corner.startsWith("top")
    ? inset("top")
    : `calc(100vh - ${inset("bottom")} - ${card.height}px)`;
  const left = corner.endsWith("left")
    ? inset("left")
    : `calc(100vw - ${inset("right")} - ${card.width}px)`;
  return { top, left };
}
