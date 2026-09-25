import type { TutorialStep } from "../types";

const courseQuizSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="course-quiz-heading"]',
    title: "Your quiz",
    body: "Every quiz you generate gets its own page like this one, always reachable again from that class's Learning tab.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="course-quiz-actions"]',
    title: "Take it, or check past results",
    body: "Take again starts a fresh attempt. Once you've completed it at least once, you can also review your last result here.",
    placement: "bottom",
  },
];

export default courseQuizSteps;
