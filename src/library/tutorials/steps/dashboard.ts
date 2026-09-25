import type { TutorialStep } from "../types";

const dashboardSteps: TutorialStep[] = [
  {
    title: "Welcome to Catalyst!",
    body: "Quick tour of how everything fits together. Skip anytime with the × — you can always replay it later from Settings.",
  },
  {
    target: '[data-tutorial="sidebar-nav"]',
    title: "Your navigation",
    body: "Every feature lives here — Classes, Learning, Calendar, AI Assistant, Advising, Profile, and Notes. It stays with you on every page.",
    placement: "right",
  },
  {
    target: '[data-tutorial="dashboard-heading"]',
    title: "Home base",
    body: "This is your dashboard — a quick launcher for whatever you want to do next.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="dashboard-cards"]',
    title: "Shortcuts to everything",
    body: "Each card jumps straight into a feature: Notes, Learning tools, Advising, your Schedule, community Discover, and AI Chat.",
    placement: "top",
  },
];

export default dashboardSteps;
