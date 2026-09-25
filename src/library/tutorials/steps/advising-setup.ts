import type { TutorialStep } from "../types";

// Shown to students who haven't uploaded advising documents yet - they only
// see the permission prompt, so the main advising_new tour (which points at
// the schedule generator) has nothing to show them until after upload.
const advisingSetupSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="advising-setup-why"]',
    title: "Advising plans your degree",
    body: "It builds a term-by-term schedule from two documents: your transcript (what you've finished) and your program's curriculum sheet (what you still need).",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="advising-setup-accept"]',
    title: "Upload them once",
    body: "Pick both PDFs on the next screen. Catalyst reads them and keeps them, so you won't have to upload again unless you want to replace them.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="advising-setup-decline"]',
    title: "Not ready yet?",
    body: "You can skip this and come back to Advising anytime. The rest of Catalyst works without these documents.",
    placement: "bottom",
  },
];

export default advisingSetupSteps;
