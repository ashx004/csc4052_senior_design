import type { TutorialStep } from "../types";

const advisingSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="sidebar-nav"]',
    title: "Navigation",
    body: "Come back here anytime from Advising in the sidebar.",
    placement: "right",
  },
  {
    target: '[data-tutorial="advising-progress"]',
    title: "Your degree progress",
    body: "Based on your added classes, this shows what you've likely completed and what's coming up next term.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="advising-search"]',
    title: "Search & filter",
    body: "Narrow recommendations down by course code, title, or department.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="advising-view-toggle"]',
    title: "Grid or list",
    body: "Switch between a card grid and a compact list, whichever you prefer for browsing.",
    placement: "left",
  },
];

export default advisingSteps;
