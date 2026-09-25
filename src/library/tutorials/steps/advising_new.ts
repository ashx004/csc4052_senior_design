import type { TutorialStep } from "../types";

const advisingNewSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="sidebar-nav"]',
    title: "Navigation",
    body: "Come back here anytime from Advising in the sidebar.",
    placement: "right",
  },
  {
    target: '[data-tutorial="advising-new-welcome"]',
    title: "AI-generated schedules",
    body: "Using your transcript and curriculum sheet, Catalyst can plan out a suggested schedule for the rest of your degree.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="advising-new-generate"]',
    title: "Generate a schedule",
    body: "Click here whenever you want a fresh AI-generated plan based on your latest documents and completed courses.",
    placement: "top",
  },
  {
    target: '[data-tutorial="advising-new-preview"]',
    title: "Your suggested plan",
    body: "Once generated, your schedule preview appears here for you to review before registering.",
    placement: "top",
  },
];

export default advisingNewSteps;
