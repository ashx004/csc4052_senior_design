// One id per page/feature this app-wide tour system covers. Adding a new
// tutorial means: add its id here, add a steps file under ./steps, mount
// <PageTutorial id="..." steps={...} /> on the page, and tag the elements
// it points at with matching data-tutorial="..." attributes.
export type TutorialId =
  | "dashboard"
  | "classes"
  | "learning"
  | "calendar"
  | "ai-assistant"
  | "advising_new"
  | "advising-setup"
  | "profile"
  | "notes"
  | "course"
  | "course-learning"
  | "course-flashcards"
  | "course-quiz"
  | "course-discover"
  | "course-discover-set"
  | "course-blocks"
  | "settings";

export const ALL_TUTORIAL_IDS: TutorialId[] = [
  "dashboard",
  "classes",
  "learning",
  "calendar",
  "ai-assistant",
  "advising_new",
  "advising-setup",
  "profile",
  "notes",
  "course",
  "course-learning",
  "course-flashcards",
  "course-quiz",
  "course-discover",
  "course-discover-set",
  "course-blocks",
  "settings",
];

export type TutorialPlacement = "top" | "bottom" | "left" | "right" | "center";

export interface TutorialStep {
  /** CSS selector for the real element this step spotlights (e.g.
   *  `[data-tutorial="classes-grid"]`). Omit for a centered intro/closing
   *  card with no spotlight cutout. If given but the element never appears
   *  (conditional content, empty state, async data), the overlay polls
   *  briefly then auto-skips to the next step rather than stranding a dark
   *  screen pointing at nothing. */
  target?: string;
  title: string;
  body: string;
  /** Preferred side for the tooltip card. Best-effort — the overlay clamps
   *  to the viewport and falls back to the opposite side if there's no room. */
  placement?: TutorialPlacement;
}
