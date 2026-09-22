import type { TutorialStep } from "../types";

const classesSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="sidebar-nav"]',
    title: "Navigation",
    body: "You can always get back here from the Classes link in the sidebar.",
    placement: "right",
  },
  {
    target: '[data-tutorial="classes-heading"]',
    title: "Your classes",
    body: "Every class you add shows up here. Use the + to enroll in a new one — you can edit its color and details anytime.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="classes-grid"]',
    title: "Open a class",
    body: "Click any card to see its resources, AI-generated course summary, schedule, and instructor info all in one place.",
    placement: "top",
  },
];

export default classesSteps;
