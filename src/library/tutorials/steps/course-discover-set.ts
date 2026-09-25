import type { TutorialStep } from "../types";

const courseDiscoverSetSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="course-discover-set-vote"]',
    title: "A shared study set",
    body: "This is a read-only preview of a set another student shared — nothing you answer here gets saved. Vote it up or down to help others find the good ones.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="course-discover-set-save"]',
    title: "Make it your own",
    body: "Save your own private copy to actually study, edit, and track separately from the original.",
    placement: "bottom",
  },
];

export default courseDiscoverSetSteps;
