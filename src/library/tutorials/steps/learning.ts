import type { TutorialStep } from "../types";

const learningSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="sidebar-nav"]',
    title: "Navigation",
    body: "Come back here anytime from Learning in the sidebar.",
    placement: "right",
  },
  {
    target: '[data-tutorial="learning-header"]',
    title: "Your learning workspace",
    body: "Notifications about your study plan and quick access to your profile live up here.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="learning-hero"]',
    title: "Your pick for today",
    body: "Catalyst names one thing to study next. Start it in a single click, or pick something else.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="learning-classes"]',
    title: "Jump into a class",
    body: "Open your classes to generate flashcards and quizzes straight from each class's uploaded materials.",
    placement: "top",
  },
];

export default learningSteps;
