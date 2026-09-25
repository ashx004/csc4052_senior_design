import type { TutorialStep } from "../types";

const courseFlashcardsSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="course-flashcards-card"]',
    title: "Flip to see the answer",
    body: "Click the card to flip between the question and answer.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="course-flashcards-nav"]',
    title: "Move through the set",
    body: "Use the arrows to go back and forth, and shuffle to study them in a random order.",
    placement: "top",
  },
];

export default courseFlashcardsSteps;
