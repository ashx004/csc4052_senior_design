import type { TutorialStep } from "../types";

const courseLearningSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="course-learning-heading"]',
    title: "Choose how you want to study",
    body: "Create a quiz to check what you remember or make flashcards for quick review.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="course-learning-grid"]',
    title: "Start with a quiz or flashcards",
    body: "Choose a quiz or flashcards, then pick the course sources you want to study. You can also start from a document below the cards.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="course-learning-recent"]',
    title: "Everything you've already made",
    body: "Your generated flashcard and quiz sets for this class live here, sortable however you like — jump back into any of them anytime.",
    placement: "top",
  },
];

export default courseLearningSteps;
