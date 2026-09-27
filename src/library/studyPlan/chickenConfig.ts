import type { ChickenState } from "./types";

export const CHICKEN_SPRITES: Record<ChickenState, string> = {
  egg: "/chicken_png_assets/sheet2/10_egg_sleeping.png",
  hatching: "/chicken_png_assets/sheet2/02_sleeping_hatching.png",
  growing: "/chicken_png_assets/sheet2/01_normal_side.png",
  almost: "/chicken_png_assets/sheet2/05_standing_side.png",
  complete: "/chicken_png_assets/sheet2/08_celebration_round.png",
  dead: "/chicken_png_assets/sheet2/04_upside_down.png",
  paused: "/chicken_png_assets/sheet2/01_normal_side.png",
  break: "/chicken_png_assets/sheet2/10_egg_sleeping.png",
};

export const CHICKEN_CELEBRATION_SPRITE =
  "/chicken_png_assets/sheet2/09_happy_wings.png";

export const PROGRESS_THRESHOLDS = {
  hatching: 0,
  growing: 0.2,
  almost: 0.8,
  complete: 1.0,
} as const;

export function getChickenStateFromProgress(
  progress: number,
  sessionStatus: "active" | "paused" | "completed" | "abandoned" | "expired"
): ChickenState {
  if (sessionStatus === "abandoned") return "dead";
  if (sessionStatus === "paused") return "paused";
  if (sessionStatus === "completed") return "complete";
  if (progress >= PROGRESS_THRESHOLDS.complete) return "complete";
  if (progress >= PROGRESS_THRESHOLDS.almost) return "almost";
  if (progress >= PROGRESS_THRESHOLDS.growing) return "growing";
  if (progress > 0) return "hatching";
  return "egg";
}

export const WIDGET_STATE_CONFIG: Record<
  string,
  {
    label: string;
    labelColor: string;
    timerColor: string;
    buttonText: string;
    buttonBg: string;
    borderAccent: string;
  }
> = {
  egg: {
    label: "Resting...",
    labelColor: "rgba(255,255,255,0.78)",
    timerColor: "white",
    buttonText: "Quit",
    buttonBg: "white",
    borderAccent: "none",
  },
  hatching: {
    label: "Hatching...",
    labelColor: "rgba(255,255,255,0.78)",
    timerColor: "white",
    buttonText: "Quit",
    buttonBg: "white",
    borderAccent: "none",
  },
  growing: {
    label: "Growing...",
    labelColor: "rgba(255,255,255,0.78)",
    timerColor: "white",
    buttonText: "Quit",
    buttonBg: "white",
    borderAccent: "none",
  },
  almost: {
    label: "Almost!",
    labelColor: "#C7D0FF",
    timerColor: "white",
    buttonText: "Quit",
    buttonBg: "white",
    borderAccent: "1px solid #93A0FF",
  },
  paused: {
    label: "Paused",
    labelColor: "#FCD34D",
    timerColor: "#FCD34D",
    buttonText: "Resume",
    buttonBg: "#FCD34D",
    borderAccent: "1px solid #92400E",
  },
  complete: {
    label: "Fully grown!",
    labelColor: "#86EFAC",
    timerColor: "#86EFAC",
    buttonText: "Close",
    buttonBg: "#86EFAC",
    borderAccent: "1px solid #2D6A2E",
  },
  dead: {
    label: "Chicken died...",
    labelColor: "#FCA5A5",
    timerColor: "#FCA5A5",
    buttonText: "Restart",
    buttonBg: "#FCA5A5",
    borderAccent: "1px solid #DC2626",
  },
  break: {
    label: "Rest up...",
    labelColor: "#BFDBFE",
    timerColor: "#BFDBFE",
    buttonText: "Skip",
    buttonBg: "#93C5FD",
    borderAccent: "1px solid #1D4ED8",
  },
};

export const EXPANDED_STATE_MESSAGES: Record<ChickenState, string> = {
  egg: "Your egg is resting...",
  hatching: "Your chick is hatching!",
  growing: "Chicken is growing...",
  almost: "Almost fully grown!",
  complete: "Your chicken is fully grown!",
  dead: "Oh no, your chicken is dead...",
  paused: "Session paused",
  break: "Rest up, next egg coming...",
};

export const EXPANDED_STATE_HINTS: Record<ChickenState, string> = {
  egg: "Before the session starts",
  hatching: "First 20% of the session",
  growing: "20%–80% of the session",
  almost: "80%–99% of the session",
  complete: "Celebration",
  dead: "Give up, or head back to your plan",
  paused: "Safe to navigate away",
  break: "Auto 5-minute break",
};

export const STATE_BADGES: Record<ChickenState, string> = {
  egg: "Egg",
  hatching: "Hatching",
  growing: "Growing",
  almost: "Almost",
  complete: "Done",
  dead: "Dead",
  paused: "Paused",
  break: "Break",
};

export const STATE_COLORS: Record<
  ChickenState,
  { accent: string; labelBg: string; labelText: string }
> = {
  egg: { accent: "#E7E5E4", labelBg: "#F4F4F5", labelText: "#54555C" },
  hatching: { accent: "#FFECE1", labelBg: "#FFECE1", labelText: "#8A6840" },
  growing: { accent: "#DCE8D8", labelBg: "#DCE8D8", labelText: "#3F6B34" },
  almost: { accent: "#E4E7FF", labelBg: "#E4E7FF", labelText: "#3D4C9E" },
  complete: { accent: "#86EFAC", labelBg: "#DCE8D8", labelText: "#1F6B30" },
  dead: { accent: "#FCA5A5", labelBg: "#FEE2E2", labelText: "#B91C1C" },
  paused: { accent: "#FCD34D", labelBg: "#FEF3C7", labelText: "#92400E" },
  break: { accent: "#93C5FD", labelBg: "#DBEAFE", labelText: "#1D4ED8" },
};

export const CORNER_POSITIONS: Record<
  string,
  { top?: string; bottom?: string; left?: string; right?: string }
> = {
  "top-left": { top: "12px", left: "12px" },
  "top-right": { top: "12px", right: "12px" },
  "bottom-left": { bottom: "12px", left: "12px" },
  "bottom-right": { bottom: "12px", right: "12px" },
};
