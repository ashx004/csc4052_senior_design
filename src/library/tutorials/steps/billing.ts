import type { TutorialStep } from "../types";

const billingSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="billing-balance"]',
    title: "Your balance",
    body: "This is your AI credit. Each AI request takes what it actually cost, with nothing added. When it runs out, AI pauses until you add more; everything else keeps working.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="billing-estimates"]',
    title: "What things cost",
    body: "Typical prices for common tasks, so you know what to expect. Below it, your history shows every top-up and where your credit went, day by day.",
    placement: "top",
  },
];

export default billingSteps;
