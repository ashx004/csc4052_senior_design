import type { ActivityType } from "./types";

/**
 * The Start button's busy label. It used to say "Preparing quiz..." for every task,
 * including flashcard ones, which is how a flashcard task could look like a quiz the
 * whole way from its title to the spinner.
 */
export function preparingLabel(activityType: ActivityType): string {
  if (activityType === "flashcards") return "Preparing flashcards...";
  if (activityType === "quiz") return "Preparing quiz...";
  return "Preparing...";
}
