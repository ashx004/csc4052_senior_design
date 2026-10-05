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
    title: "Your daily overview",
    body: "Your dashboard keeps today's most important information in one place, so you can see what needs attention before jumping into a workspace.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="dashboard-cards"]',
    title: "What needs attention",
    body: "Check today's schedule, upcoming deadlines, your next study task, and your active classes. Use each card to open the full workspace when you're ready.",
    placement: "top",
  },
];

export default dashboardSteps;
