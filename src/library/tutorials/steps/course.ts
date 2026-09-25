import type { TutorialStep } from "../types";

// Generic course-page tour — shown once, the first time this user opens
// ANY course (tracked under the single "course" id, not per-courseId), since
// every course page uses this same template.
const courseSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="course-heading"]',
    title: "Welcome to your course page",
    body: "Every class you're enrolled in has a page like this one, with its own details, instructor info, and resources.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="course-summary"]',
    title: "AI course summary",
    body: "Once you upload documents for this class, Catalyst generates a short summary here automatically.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="course-details"]',
    title: "Class details",
    body: "Schedule, time, room, and description — edit any of it with the pencil icon.",
    placement: "right",
  },
  {
    target: '[data-tutorial="course-instructor"]',
    title: "Instructor info",
    body: "Your professor's contact info, kept alongside the class.",
    placement: "left",
  },
  {
    target: '[data-tutorial="course-resources"]',
    title: "Course resources",
    body: "Every document you upload for this class — notes, assignments, slides — shows up here for quick preview.",
    placement: "top",
  },
];

export default courseSteps;
