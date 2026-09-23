import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import FaqAccordion, { type FaqItem } from "@/src/components/help/FaqAccordion";

interface FaqSection {
  id: string;
  title: string;
  items: FaqItem[];
}

// Grouped so a confused user can jump straight to the area they're stuck
// in (via the quick-jump nav below) instead of scrolling a flat wall of
// questions - same reasoning as splitting the site itself into pages
// rather than one long dashboard.
const sections: FaqSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    items: [
      {
        question: "What is Catalyst?",
        answer: [
          "Catalyst is a study and advising platform built around your actual course materials. Add your classes, upload documents, and Catalyst generates flashcards, quizzes, and summaries from them — plus an AI assistant that can read those documents, search the web, and manage your calendar for you.",
        ],
      },
      {
        question: "How do I add a class?",
        answer: [
          "Go to Classes in the sidebar and use the + button to enroll in a new one. You can edit its color and details anytime from there.",
        ],
      },
      {
        question: "Where do I find everything?",
        answer: [
          "The sidebar (always visible on the left) is your home base — Dashboard, Classes, Learning, Calendar, AI Assistant, Advising, Notes, and Profile all live there and stay with you on every page.",
          "The Dashboard itself also has shortcut cards to jump straight into whatever you want to do next.",
        ],
      },
      {
        question: "Can I go through the guided tutorials again?",
        answer: [
          'Yes — open Settings and click "Replay tutorials." That resets every page\'s guided tour (and turns tutorials back on if you\'d previously checked "don\'t show me tutorials again"), so each one shows again the next time you visit that page.',
        ],
      },
    ],
  },
  {
    id: "notes-documents",
    title: "Notes & Documents",
    items: [
      {
        question: "How do I upload a document?",
        answer: [
          'Go to Notes in the sidebar and use the upload area there — pick which class it belongs to and tag it (class doc, notes, or assignment). You can also upload directly from a class\'s own page under "Course Resources."',
        ],
      },
      {
        question: "Where do my uploaded documents show up?",
        answer: [
          "Everywhere that's relevant: the Notes page lists everything you've ever uploaded, and each document also appears under its own class's Course Resources for quick preview.",
        ],
      },
      {
        question: "What kinds of files can I upload?",
        answer: [
          "PDFs and Word documents work directly. Scanned or photographed pages (images) go through OCR automatically to pull out the text — it can take a little longer than a regular PDF, especially the first time in a while (see \"Why is OCR/upload taking a long time?\" under Troubleshooting).",
        ],
      },
    ],
  },
  {
    id: "study-tools",
    title: "Study Tools (Learning, Flashcards, Quizzes, Discover)",
    items: [
      {
        question: "How do I make flashcards or quizzes from my notes?",
        answer: [
          "Open a class from Learning in the sidebar, pick one of your uploaded documents, and choose to generate flashcards or a quiz from it. They're saved under that class so you can come back to them anytime.",
        ],
      },
      {
        question: "How do flashcards work once I'm studying them?",
        answer: [
          "Click a card to flip between the question and answer, and use the arrows to move between cards. The shuffle button randomizes the order, and once you reach the last card you can generate more from the same document.",
        ],
      },
      {
        question: "What is Discover?",
        answer: [
          "Discover (inside a class page) is where you find study sets other students in your course have shared publicly, plus a \"Learn Questions\" widget that quizzes you with random questions pulled from all your active classes.",
          "There's also a game, Blocks, if you'd rather review material while doing something a little more hands-on — it has its own \"How to Play\" screen the first time you open it.",
        ],
      },
      {
        question: "Can other students see the flashcards/quizzes I make?",
        answer: [
          "Only if you choose to share them. Sets you generate are private by default — sharing to Discover is a separate, explicit action, and you can toggle a set's visibility back to private at any time from Learning.",
        ],
      },
    ],
  },
  {
    id: "ai-assistant",
    title: "AI Assistant",
    items: [
      {
        question: "What can the AI Assistant actually do?",
        answer: [
          "A lot more than chat: it can read and search your uploaded course documents, search the web or YouTube, create flashcards/quizzes/PDFs on the fly, and view, create, update, or delete your calendar events — all from inside the conversation.",
          "Open the toolbox icon in the assistant's toolbar to see the full list of what it's currently able to do.",
        ],
      },
      {
        question: "Why does it sometimes take a while to respond?",
        answer: [
          "The underlying AI model has to \"cold boot\" into memory if it hasn't been used recently, which can take a bit longer than a normal reply. This is more noticeable right after periods of inactivity — it stays warm for a while after you start using it.",
        ],
      },
      {
        question: "Does the assistant remember earlier conversations?",
        answer: [
          "Within a conversation, yes — it keeps the full thread and can also recall relevant parts of your past chats when it's genuinely useful for answering your current question, not just the messages you can currently scroll back through.",
        ],
      },
      {
        question: "Can I attach a document to a chat?",
        answer: [
          "Yes — use the paperclip in the chat input. You can also just ask about a class or document by name if you've already uploaded it; the assistant can search and read your materials without you attaching anything.",
        ],
      },
    ],
  },
  {
    id: "advising",
    title: "Advising",
    items: [
      {
        question: 'What\'s the difference between "Advising" and "Advising New & Improved"?',
        answer: [
          "Advising is a browsable view of course/requirement recommendations you can search and filter. Advising New & Improved is the AI schedule generator — it reads your transcript and curriculum sheet and proposes a full suggested schedule for the rest of your degree.",
        ],
      },
      {
        question: "How does the AI-generated schedule work?",
        answer: [
          "Upload your transcript and your program's curriculum sheet, then click Generate Schedule. Catalyst compares what you've already completed against your requirements and lays out a term-by-term plan — review it carefully before actually registering, it's a starting point, not a guarantee.",
        ],
      },
      {
        question: "What if I have transfer credit, AP credit, or a course that isn't showing up correctly?",
        answer: [
          'Use "Add a completed course" on the Advising New & Improved page to manually record anything that didn\'t come through automatically from your transcript. If Catalyst couldn\'t confidently read part of your transcript, it will prompt you for this itself right after upload.',
        ],
      },
      {
        question: "Why does Advising need my transcript and curriculum sheet at all?",
        answer: [
          "Those are the only two documents that actually say what you've completed and what your specific program still requires — without them, any suggested schedule would just be a generic guess instead of one based on your real progress.",
        ],
      },
    ],
  },
  {
    id: "calendar",
    title: "Calendar",
    items: [
      {
        question: "How do I connect Google Calendar?",
        answer: [
          "From the Calendar page, use the connect option there and sign in with Google. Once connected, your Google events show up alongside anything you add directly in Catalyst.",
        ],
      },
      {
        question: "Can I add personal (non-class) events?",
        answer: [
          'Yes — the "Add an event" button on the Calendar page works for anything, not just classes or assignments.',
        ],
      },
      {
        question: "Can the AI assistant manage my calendar for me?",
        answer: [
          'Yes — just ask it in chat, e.g. "add a study session Thursday at 6pm" or "what do I have due this week?" It can view, create, update, and delete events directly.',
        ],
      },
    ],
  },
  {
    id: "account-settings",
    title: "Account & Settings",
    items: [
      {
        question: "How do I change the theme?",
        answer: ["Settings has a Light/Dark toggle, plus a separate Coffee theme option if you want something different from the default look."],
      },
      {
        question: 'What does "what Catalyst has learned" on my Profile mean?',
        answer: [
          "Catalyst quietly builds a short private summary of your academic goals and learning style over time, purely to tailor how it explains things to you. You can view it or clear it entirely from your Profile page whenever you want.",
        ],
      },
      {
        question: "How do I stop the guided tutorials from popping up?",
        answer: [
          'Any tutorial\'s "Skip" button has a "Don\'t show me tutorials again" checkbox next to it — check it before skipping and no page\'s tour will show again. You can undo this anytime with "Replay tutorials" in Settings.',
        ],
      },
    ],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting & Common Errors",
    items: [
      {
        question: '"The AI server took too long to start responding" — what does this mean?',
        answer: [
          "The AI model was still loading (a cold start) when the connection timed out. This is a server-side hiccup, not something wrong with your request — wait a minute for it to finish loading and try again; it should respond much faster the second time.",
        ],
      },
      {
        question: "Why is OCR/document upload taking a long time?",
        answer: [
          "Scanned/photographed pages need to run through OCR before Catalyst can read them, which takes longer than a regular text-based PDF — especially for a large document or the first upload in a while. If it seems stuck for several minutes rather than just slow, try re-uploading.",
        ],
      },
      {
        question: "The AI assistant gave an empty or cut-off answer.",
        answer: [
          "This can happen if the model's response hit an internal length/context limit or briefly failed to generate anything — it's usually a one-off. Just ask again; if it's a very long document or request, try breaking it into a smaller, more specific question.",
        ],
      },
      {
        question: "I don't see any classes, recommendations, or study sets.",
        answer: [
          "Most of these views are empty until you've added a class or uploaded a document — Classes needs at least one enrolled class, Advising's recommendations need your program info, and Discover's shared sets depend on what other students in that specific class have posted.",
        ],
      },
      {
        question: "A tutorial popped up pointing at nothing / a blank area.",
        answer: [
          "The tour is likely pointing at something that only appears once your data finishes loading (e.g. a document list). It waits briefly for that to show up and will automatically skip to the next step if it never does — this is expected on an empty page rather than a bug to report.",
        ],
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-bg-main px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/settings"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-muted transition hover:text-text-main"
        >
          <ArrowLeft size={16} />
          Back to Settings
        </Link>

        <h1 className="text-2xl font-bold text-text-main sm:text-3xl">Help &amp; FAQ</h1>
        <p className="mt-2 text-sm text-text-muted">
          Answers to common questions about using Catalyst. Didn&apos;t find what you needed? Ask the AI Assistant
          directly — it can usually help faster than digging through here.
        </p>

        {/* Quick-jump nav - a long FAQ is only "well organized" if you can
            skip straight to the section you actually came for. */}
        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Jump to section">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-full border border-border-light bg-bg-container px-3 py-1.5 text-xs font-medium text-text-main transition hover:bg-bg-warm"
            >
              {section.title}
            </a>
          ))}
        </nav>

        <div className="mt-8 space-y-10">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-8">
              <h2 className="mb-3 text-lg font-bold text-text-main">{section.title}</h2>
              <FaqAccordion items={section.items} />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
