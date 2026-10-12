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
    title: "Your result, and what to do next",
    body: "Opening a quiz drops you straight into the questions, or back on your latest result if you've taken it before. From a result you can retry it or practise just what you missed.",
    placement: "bottom",
  },
];

export default courseQuizSteps;
