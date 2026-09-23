import type { TutorialStep } from "../types";

const settingsSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="settings-appearance"]',
    title: "Make it yours",
    body: "Switch between light and dark mode here, plus a Coffee theme further down if you want something different.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="settings-tutorials"]',
    title: "Replay any guided tour",
    body: "Skipped a tutorial, or opted out of all of them? This brings every page's tour back the next time you visit it.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="settings-help"]',
    title: "Stuck on something?",
    body: "The Help & FAQ page has answers to common questions about how the site works, organized by topic.",
    placement: "bottom",
  },
];

export default settingsSteps;
