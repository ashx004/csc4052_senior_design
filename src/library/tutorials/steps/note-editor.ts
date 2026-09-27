import type { TutorialStep } from "../types";

const noteEditorSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="note-toolbar"]',
    title: "Write and format",
    body: "Bold, italics and H1-H3 headings are here. Markdown works too: type # for a heading or **word** for bold.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="note-draw-tools"]',
    title: "Draw and highlight",
    body: "Pick the pencil (click it again to change the tip size), a highlighter color, or the eraser, which removes whole strokes. Click the T to go back to typing.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="note-rail-toggle"]',
    title: "Your other notes",
    body: "Open your recent notes here, start a new one, or see all of them.",
    placement: "bottom",
  },
];

export default noteEditorSteps;
