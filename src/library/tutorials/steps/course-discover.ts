import type { TutorialStep } from "../types";

const courseDiscoverSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="course-discover-heading"]',
    title: "Discover",
    body: "Every class has its own Discover page — study sets other students shared, quick practice questions, and a game, all specific to this class.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="course-discover-sets"]',
    title: "Shared study sets",
    body: "Browse flashcard and quiz sets other students in this class have made public. Nothing here unless someone's shared one yet — be the first!",
    placement: "top",
  },
  {
    target: '[data-tutorial="course-discover-learn-questions"]',
    title: "Learn Questions",
    body: "A quick practice widget pulling random questions from all your active classes, not just this one — a fast way to review between study sessions.",
    placement: "top",
  },
  {
    target: '[data-tutorial="course-discover-game"]',
    title: "Switch it up with a game",
    body: "Blocks reviews the same material while you play — it has its own \"How to Play\" the first time you open it.",
    placement: "top",
  },
];

export default courseDiscoverSteps;
