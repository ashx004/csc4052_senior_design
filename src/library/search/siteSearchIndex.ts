// Everything the top-bar search can find: Catalyst's pages, plus the
// features inside them (pointing at the page that has the feature). Keywords
// are the other words a student might type for the same thing - "schedule"
// should find Advising and Calendar, "dark mode" should find Settings.
//
// When adding a page or a major feature, add an entry here so it's
// searchable. Descriptions follow the page's guided tutorial
// (src/library/tutorials/steps) so the two stay consistent.

export type SearchCategory = "Page" | "Feature" | "Help" | "This class";

export type SearchEntry = {
  id: string;
  title: string;
  description: string;
  href: string;
  category: SearchCategory;
  keywords: string[];
  // Another name that counts as an exact title match - e.g. "Blocks game"
  // for "CSC 4052 Blocks game", so a class's own section isn't outranked by
  // the general feature just because its title starts with the class name.
  shortTitle?: string;
};

export const SITE_SEARCH_ENTRIES: SearchEntry[] = [
  // ── Pages ─────────────────────────────────────────────────────────────
  {
    id: "page-dashboard",
    title: "Home",
    description: "Your dashboard - shortcuts to Notes, Learning, Advising, your schedule, Discover, and AI chat.",
    href: "/dashboard",
    category: "Page",
    keywords: ["dashboard", "home", "start", "main", "launcher", "overview"],
  },
  {
    id: "page-classes",
    title: "Classes",
    description: "Every class you're enrolled in. Add a class or open one to see its resources and details.",
    href: "/classes",
    category: "Page",
    keywords: ["courses", "class", "enrollment", "enrolled", "my classes", "subjects"],
  },
  {
    id: "page-learning",
    title: "Learning",
    description: "Build a study plan and generate flashcards and quizzes from your class materials.",
    href: "/learning",
    category: "Page",
    keywords: ["study", "study plan", "flashcards", "quizzes", "practice", "review"],
  },
  {
    id: "page-calendar",
    title: "Calendar",
    description: "Your schedule in one place - connect Google Calendar or add events manually.",
    href: "/calendar",
    category: "Page",
    keywords: ["schedule", "events", "dates", "deadlines", "google calendar", "planner", "agenda"],
  },
  {
    id: "page-ai-assistant",
    title: "AI Assistant",
    description: "Chat with Catalyst about your classes and notes. Attach documents and browse past chats.",
    href: "/ai-assistant",
    category: "Page",
    keywords: ["ai", "chat", "chatbot", "assistant", "ask", "help me", "tutor", "question"],
  },
  {
    id: "page-advising",
    title: "Advising",
    description: "Plan your degree - Catalyst builds a term-by-term schedule from your transcript and curriculum sheet.",
    href: "/advising_new",
    category: "Page",
    keywords: ["advisor", "degree", "schedule", "degree plan", "registration", "transcript", "curriculum", "graduation"],
  },
  {
    id: "page-profile",
    title: "Profile",
    description: "Your name, major, expected graduation, university, and what Catalyst has learned about you.",
    href: "/profile",
    category: "Page",
    keywords: ["account", "me", "personal information", "name", "major", "university", "school"],
  },
  {
    id: "page-notes",
    title: "Notes",
    description: "All your uploaded documents. Upload notes, class docs, or assignments to have them scanned in.",
    href: "/notes",
    category: "Page",
    keywords: ["documents", "files", "upload", "notes", "pdf", "scan", "resources"],
  },
  {
    id: "page-discover",
    title: "Discover",
    description: "Study sets other students shared, quick practice questions, and the Blocks game, for each of your classes.",
    href: "/discover",
    category: "Page",
    keywords: ["shared", "community", "study sets", "public", "browse", "explore"],
  },
  {
    id: "page-settings",
    title: "Settings",
    description: "Light and dark mode, the Coffee theme, and replaying the guided tours.",
    href: "/settings",
    category: "Page",
    keywords: ["preferences", "options", "theme", "dark mode", "light mode", "appearance"],
  },
  {
    id: "page-help",
    title: "Help & FAQ",
    description: "Answers to common questions about how Catalyst works, organized by topic.",
    href: "/help",
    category: "Page",
    keywords: ["help", "faq", "support", "questions", "how to", "guide", "stuck"],
  },

  // ── Features (each points at the page that has it) ────────────────────
  {
    id: "feature-add-class",
    title: "Add a class",
    description: "Enroll in a new class from the Classes page.",
    href: "/classes",
    category: "Feature",
    keywords: ["enroll", "new class", "add course", "join class"],
  },
  {
    id: "feature-upload-document",
    title: "Upload a document",
    description: "Add notes, a class doc, or an assignment to one of your classes.",
    href: "/notes",
    category: "Feature",
    keywords: ["upload", "add file", "add notes", "pdf", "document", "scan"],
  },
  {
    id: "feature-study-plan",
    title: "Study plan",
    description: "Start a personalized study plan on the Learning page.",
    href: "/learning",
    category: "Feature",
    keywords: ["plan", "study session", "focus", "tasks"],
  },
  {
    id: "feature-flashcards",
    title: "Flashcards",
    description: "Generate flashcards from a class's uploaded documents - open a class from Learning.",
    href: "/learning",
    category: "Feature",
    keywords: ["cards", "flash cards", "memorize", "generate flashcards"],
  },
  {
    id: "feature-quizzes",
    title: "Quizzes",
    description: "Generate a quiz from a class's uploaded documents - open a class from Learning.",
    href: "/learning",
    category: "Feature",
    keywords: ["quiz", "test", "exam", "practice test", "generate quiz"],
  },
  {
    id: "feature-blocks",
    title: "Blocks game",
    description: "A puzzle game that quizzes you on a class between rounds - find it on a class's Discover page.",
    href: "/discover",
    category: "Feature",
    keywords: ["game", "puzzle", "play", "blocks"],
  },
  {
    id: "feature-generate-schedule",
    title: "Generate a schedule",
    description: "Have Catalyst plan your remaining courses from your transcript and curriculum sheet.",
    href: "/advising_new",
    category: "Feature",
    keywords: ["course schedule", "plan courses", "what to take", "next semester", "next quarter", "register"],
  },
  {
    id: "feature-transcript-upload",
    title: "Upload transcript & curriculum",
    description: "Give Advising your transcript and curriculum sheet so it can plan your degree.",
    href: "/advising_new",
    category: "Feature",
    keywords: ["transcript", "curriculum sheet", "degree audit"],
  },
  {
    id: "feature-transfer-credit",
    title: "Add transfer credit",
    description: "Add a course you completed elsewhere so Advising counts it.",
    href: "/advising_new",
    category: "Feature",
    keywords: ["transfer", "ap credit", "completed course", "credit"],
  },
  {
    id: "feature-add-event",
    title: "Add a calendar event",
    description: "Add a class, assignment, or personal event to your calendar.",
    href: "/calendar",
    category: "Feature",
    keywords: ["event", "reminder", "due date", "assignment"],
  },
  {
    id: "feature-google-calendar",
    title: "Connect Google Calendar",
    description: "Sync your Google Calendar events into Catalyst.",
    href: "/calendar",
    category: "Feature",
    keywords: ["google", "sync", "import calendar"],
  },
  {
    id: "feature-chat-history",
    title: "Chat history",
    description: "Browse previous AI Assistant conversations or start a new chat.",
    href: "/ai-assistant",
    category: "Feature",
    keywords: ["past chats", "conversations", "new chat"],
  },
  {
    id: "feature-dark-mode",
    title: "Dark mode",
    description: "Switch between light and dark mode, or try the Coffee theme.",
    href: "/settings",
    category: "Feature",
    keywords: ["theme", "light mode", "coffee", "colors", "appearance", "night"],
  },
  {
    id: "feature-replay-tutorials",
    title: "Replay guided tours",
    description: "Bring every page's tutorial back the next time you visit it.",
    href: "/settings",
    category: "Feature",
    keywords: ["tutorial", "tour", "walkthrough", "onboarding", "guide"],
  },
  {
    id: "feature-university",
    title: "Set your university",
    description: "Lets Advising pull real course-offering data for your school.",
    href: "/profile",
    category: "Feature",
    keywords: ["school", "college", "university"],
  },
  {
    id: "feature-learned-summary",
    title: "What Catalyst has learned",
    description: "View or clear the private summary of your goals and learning style.",
    href: "/profile",
    category: "Feature",
    keywords: ["memory", "personalization", "learning style", "privacy"],
  },

  // ── Help topics (sections of the Help & FAQ page) ─────────────────────
  {
    id: "help-getting-started",
    title: "Getting started",
    description: "Help: what Catalyst is, adding a class, and finding your way around.",
    href: "/help#getting-started",
    category: "Help",
    keywords: ["new", "begin", "intro", "how to use"],
  },
  {
    id: "help-notes-documents",
    title: "Help with notes & documents",
    description: "Help: uploading documents, where they show up, and supported file types.",
    href: "/help#notes-documents",
    category: "Help",
    keywords: ["file types", "upload problem", "documents"],
  },
  {
    id: "help-study-tools",
    title: "Help with study tools",
    description: "Help: Learning, flashcards, quizzes, and Discover.",
    href: "/help#study-tools",
    category: "Help",
    keywords: ["flashcards help", "quiz help", "discover help"],
  },
  {
    id: "help-ai-assistant",
    title: "Help with the AI Assistant",
    description: "Help: chatting with Catalyst and attaching documents.",
    href: "/help#ai-assistant",
    category: "Help",
    keywords: ["chat help", "ai help"],
  },
  {
    id: "help-advising",
    title: "Help with Advising",
    description: "Help: transcripts, curriculum sheets, and generated schedules.",
    href: "/help#advising",
    category: "Help",
    keywords: ["advising help", "schedule help", "transcript help"],
  },
  {
    id: "help-calendar",
    title: "Help with the Calendar",
    description: "Help: events, views, and Google Calendar.",
    href: "/help#calendar",
    category: "Help",
    keywords: ["calendar help", "events help"],
  },
  {
    id: "help-account-settings",
    title: "Help with account & settings",
    description: "Help: your profile, themes, and account settings.",
    href: "/help#account-settings",
    category: "Help",
    keywords: ["account help", "settings help", "profile help"],
  },
  {
    id: "help-troubleshooting",
    title: "Troubleshooting & common errors",
    description: "Help: fixes for common problems and error messages.",
    href: "/help#troubleshooting",
    category: "Help",
    keywords: ["error", "broken", "not working", "bug", "problem", "fix"],
  },
];

// A class's own sections, searchable while the student is on that class's
// pages (they need the class's id, so they can't be part of the fixed list).
// The class's Assignments, Due dates, Notes, and Summaries pages are left out
// while they're still empty placeholders - add them here once they're built.
export function courseSearchEntries(courseId: string, courseName?: string | null): SearchEntry[] {
  const base = `/courses/${courseId}`;
  const name = courseName || "this class";
  const entry = (id: string, shortTitle: string, description: string, path: string, keywords: string[]): SearchEntry => ({
    id: `course-${id}`,
    title: `${name} ${shortTitle}`,
    shortTitle,
    description: `${name}: ${description}`,
    href: `${base}${path}`,
    category: "This class",
    keywords,
  });

  return [
    entry("home", "overview", "class details, instructor info, AI summary, and resources.", "", ["course page", "class page", "details", "instructor", "resources"]),
    entry("learning", "learning", "generate flashcards and quizzes from this class's documents.", "/learning", ["flashcards", "quizzes", "generate", "study"]),
    entry("discover", "discover", "study sets other students shared for this class.", "/discover", ["shared", "study sets", "community", "practice"]),
    entry("blocks", "Blocks game", "the puzzle game that quizzes you on this class.", "/discover/blocks", ["game", "puzzle", "play"]),
  ];
}
