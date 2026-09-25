import type { EventCategory } from "@/src/components/calendar/calendarTypes";

const EXAM_KEYWORDS = [
  "exam", "midterm", "final", "test", "assessment", "quiz"
];

const DEADLINE_KEYWORDS = [
  "due", "deadline", "submission", "assignment", "homework", "project due"
];

const CLASS_KEYWORDS = [
  "lecture", "lab", "class", "section", "seminar", "tutorial",
  "office hours", "recitation"
];

function matchesAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

export function inferEventCategory(event: {
  title: string;
  description?: string;
}): EventCategory | null {
  const searchText = `${event.title} ${event.description ?? ""}`;

  if (matchesAny(searchText, EXAM_KEYWORDS)) return "exam";
  if (matchesAny(searchText, DEADLINE_KEYWORDS)) return "deadline";
  if (matchesAny(searchText, CLASS_KEYWORDS)) return "class";

  return null;
}
