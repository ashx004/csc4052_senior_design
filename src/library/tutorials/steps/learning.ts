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
    title: "Build a study plan",
    body: "Start a personalized study plan, or explore your classes without one — Catalyst adapts either way.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="learning-classes"]',
    title: "Jump into a class",
    body: "Click any class to generate flashcards and quizzes straight from its uploaded materials.",
    placement: "top",
  },
];

export default learningSteps;
