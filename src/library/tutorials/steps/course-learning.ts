import type { TutorialStep } from "../types";

const courseLearningSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="course-learning-heading"]',
    title: "Turn documents into study material",
    body: "This is where you generate flashcards and quizzes straight from anything you've uploaded to this class.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="course-learning-grid"]',
    title: "Pick a document",
    body: "Click any document to generate flashcards or a quiz from it. Nothing here yet? Upload resources from the class page or Notes first.",
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
