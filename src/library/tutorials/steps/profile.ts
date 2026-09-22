import type { TutorialStep } from "../types";

const profileSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="sidebar-nav"]',
    title: "Navigation",
    body: "Come back here anytime from Profile in the sidebar.",
    placement: "right",
  },
  {
    target: '[data-tutorial="profile-university"]',
    title: "Your university",
    body: "Set this so Advising can pull real course-offering data for your school.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="profile-learned"]',
    title: "What Catalyst has learned",
    body: "Catalyst builds a private summary of your academic goals and learning style over time, purely to tailor its explanations. You can view or clear it here anytime.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="profile-personal"]',
    title: "Personal information",
    body: "Update your name, major, and expected graduation with the pencil icon.",
    placement: "top",
  },
];

export default profileSteps;
