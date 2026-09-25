import type { TutorialStep } from "../types";

const notesSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="sidebar-nav"]',
    title: "Navigation",
    body: "Come back here anytime from Notes in the sidebar.",
    placement: "right",
  },
  {
    target: '[data-tutorial="notes-heading"]',
    title: "All your documents",
    body: "Upload documents to have them scanned in, then come back here to review everything you've already scanned.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="notes-upload"]',
    title: "Upload a document",
    body: "Pick the class it belongs to, tag it as a class doc, notes, or an assignment, then drop a file here — it'll also show up in that class's own resources.",
    placement: "top",
  },
];

export default notesSteps;
