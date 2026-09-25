import type { TutorialStep } from "../types";

const courseBlocksSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="blocks-intro"]',
    title: "Blocks",
    body: "A puzzle game that quizzes you on this class between rounds, so you review while you play.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="blocks-play"]',
    title: "Place pieces, answer questions",
    body: "Drag pieces onto the board and fill rows or columns to clear them. After your 4 pieces are placed, answer a question from this class to get the next 4.",
    placement: "top",
  },
  {
    target: '[data-tutorial="blocks-how-to"]',
    title: "Full rules",
    body: "How to Play covers scoring, skips, and when the game ends.",
    placement: "top",
  },
];

export default courseBlocksSteps;
