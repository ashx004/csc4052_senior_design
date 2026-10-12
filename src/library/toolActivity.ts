// How the chat describes a tool the assistant is using: a label while it runs,
// one for when it has finished, and a short detail ("“mitosis”", a document or
// event name). Shared by the server (which builds the detail from the tool's
// arguments) and the browser (which shows it), so it has no server-only imports.

export interface ToolLabels {
  running: string;
  done: string;
}

export const TOOL_LABELS: Record<string, ToolLabels> = {
  list_enrolled_classes: { running: "Looking up your classes...", done: "Looked up your classes" },
  get_course_details: { running: "Checking a class's details...", done: "Checked a class's details" },
  update_course_details: { running: "Updating a class...", done: "Prepared a class update" },
  get_course_confidence: { running: "Checking how you're doing...", done: "Checked how you're doing" },
  set_self_confidence: { running: "Saving your self-rating...", done: "Saved your self-rating" },
  search_documents: { running: "Searching your documents...", done: "Searched your documents" },
  read_document: { running: "Reading a document...", done: "Read a document" },
  list_study_sets: { running: "Looking through your study sets...", done: "Looked through your study sets" },
  web_search: { running: "Searching the web...", done: "Searched the web" },
  search_youtube: { running: "Looking for videos...", done: "Looked for videos" },
  create_pdf: { running: "Creating a PDF...", done: "Created a PDF" },
  create_flashcards: { running: "Creating flashcards...", done: "Created flashcards" },
  create_quiz: { running: "Creating a quiz...", done: "Created a quiz" },
  list_calendar_events: { running: "Checking your calendar...", done: "Checked your calendar" },
  create_calendar_event: { running: "Adding to your calendar...", done: "Prepared a calendar event" },
  update_calendar_event: { running: "Updating your calendar...", done: "Prepared a calendar change" },
  delete_calendar_event: { running: "Removing from your calendar...", done: "Prepared a calendar removal" },
  list_notes: { running: "Looking through your notes...", done: "Looked through your notes" },
  read_note: { running: "Reading a note...", done: "Read a note" },
  create_note: { running: "Writing a note...", done: "Wrote a note" },
  edit_note: { running: "Editing a note...", done: "Prepared a note edit" },
  delete_note: { running: "Removing a note...", done: "Prepared a note removal" },
  organize_notes: { running: "Organizing your notes...", done: "Prepared note changes" },
  recall_past_chat: { running: "Checking past conversations...", done: "Checked past conversations" },
  load_tools: { running: "Getting the right tools ready...", done: "Got tools ready" },
};

export function toolRunningLabel(name: string): string {
  return TOOL_LABELS[name]?.running ?? "Working on it...";
}

export function toolDoneLabel(name: string): string {
  return TOOL_LABELS[name]?.done ?? "Finished a step";
}

const DETAIL_KEYS = ["query", "documentName", "title", "name", "topic", "notebook"];
const MAX_DETAIL_CHARS = 60;

/**
 * A short, safe description of what a tool call is about. Only plain words the
 * student typed or chose (a search query, a file or event name) - never IDs.
 */
export function toolDetail(name: string, args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const record = args as Record<string, unknown>;
  for (const key of DETAIL_KEYS) {
    const value = record[key];
    if (typeof value !== "string") continue;
    const clean = value
      .replace(/\s+/g, " ")
      // Anything that looks like a database ID or token, not a word.
      .replace(/\b[A-Za-z0-9_-]{20,}\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) continue;
    const shown = clean.length > MAX_DETAIL_CHARS ? `${clean.slice(0, MAX_DETAIL_CHARS - 1).trimEnd()}…` : clean;
    return name === "search_documents" || name === "web_search" || name === "search_youtube" || name === "recall_past_chat"
      ? `“${shown}”`
      : shown;
  }
  return undefined;
}
