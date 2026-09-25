import type { TutorialStep } from "../types";

const aiAssistantSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="sidebar-nav"]',
    title: "Navigation",
    body: "The AI Assistant link in the sidebar always brings you back here.",
    placement: "right",
  },
  {
    target: '[data-tutorial="ai-toolbar"]',
    title: "Chat history",
    body: "Browse previous conversations, or start a fresh chat with the + button.",
    placement: "bottom",
  },
  {
    target: '[data-tutorial="ai-toolbox-btn"]',
    title: "See what it can do",
    body: "Catalyst can do more than chat — open the toolbox to see the tools available to the assistant.",
    placement: "top",
  },
  {
    target: '[data-tutorial="ai-chat-input"]',
    title: "Ask anything",
    body: "Attach a document with the paperclip, then ask about your classes, notes, or anything else — Catalyst reads your uploaded materials.",
    placement: "top",
  },
];

export default aiAssistantSteps;
