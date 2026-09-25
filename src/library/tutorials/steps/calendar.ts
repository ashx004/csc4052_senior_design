import type { TutorialStep } from "../types";

const calendarSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="sidebar-nav"]',
    title: "Navigation",
    body: "Come back here anytime from the Calendar link in the sidebar.",
    placement: "right",
  },
  {
    target: '[data-tutorial="calendar-heading"]',
    title: "Your schedule",
    body: "Connect Google Calendar or add events manually — everything academic and personal lives in one place.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="calendar-add-event"]',
    title: "Add an event",
    body: "Quickly add a class, assignment, or personal event to your calendar.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="calendar-view-toggle"]',
    title: "Switch views",
    body: "Flip between Monthly, Weekly, and Daily views to zoom in on exactly what you need.",
    placement: "bottom",
  },
];

export default calendarSteps;
