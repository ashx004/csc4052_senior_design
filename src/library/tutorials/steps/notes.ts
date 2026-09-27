import type { TutorialStep } from "../types";

const notesSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="sidebar-nav"]',
    title: "Navigation",
    body: "Come back here anytime from Notes in the sidebar. Each class also has its own Notes tab.",
    placement: "right",
  },
  {
    target: '[data-tutorial="notes-upload"]',
    title: "Add notes",
    body: "Type a new note, or scan and upload handwritten notes - your camera works too. Files tagged Notes in a class show up here automatically.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="notes-scope"]',
    title: "General or one class",
    body: "See every note, or narrow it down to a single class.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="notes-notebooks"]',
    title: "Notebooks",
    body: "Group notes into notebooks - even from different classes. Drag notes onto one, then make flashcards or a quiz from the whole notebook.",
    placement: "right",
  },
  {
    target: '[data-tutorial="notes-search"]',
    title: "Find anything",
    body: "Search looks through titles and everything written inside your notes.",
    placement: "bottom",
  },
];

export default notesSteps;
