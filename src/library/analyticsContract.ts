import { z } from "zod";

const MAX_DURATION_SECONDS = 7 * 24 * 60 * 60;

const quizProperties = {
  quiz_type: z.enum(["full_quiz", "targeted_practice"]),
  question_count: z.number().int().min(1).max(1000),
};
const uploadProperties = {
  file_type: z.enum([
    "pdf",
    "document",
    "spreadsheet",
    "image",
    "text",
    "other",
  ]),
  entry_point: z.enum(["resource", "ocr"]),
};
const durationSeconds = z.number().finite().min(0).max(MAX_DURATION_SECONDS);
const taskType = z.enum(["quiz", "flashcards", "reading", "ai_explanation"]);

function isNormalizedPageName(pageName: string): boolean {
  return normalizeAnalyticsPath(pageName) === pageName;
}

export const eventSchemas = {
  page_view: z
    .object({ page_name: z.string().refine(isNormalizedPageName) })
    .strict(),
  quiz_started: z.object(quizProperties).strict(),
  quiz_completed: z
    .object({ ...quizProperties, duration_seconds: durationSeconds })
    .strict(),
  resource_upload_started: z.object(uploadProperties).strict(),
  resource_upload_succeeded: z.object(uploadProperties).strict(),
  resource_upload_failed: z
    .object({
      ...uploadProperties,
      error_category: z.enum(["network", "storage", "unknown"]),
    })
    .strict(),
  study_session_started: z.object({ task_type: taskType }).strict(),
  study_session_completed: z
    .object({
      task_type: taskType,
      duration_seconds: durationSeconds,
    })
    .strict(),
};

export type AnalyticsEvent = keyof typeof eventSchemas;
export type EventProperties<EventName extends AnalyticsEvent> = z.infer<
  (typeof eventSchemas)[EventName]
>;
export const eventNames = Object.keys(eventSchemas) as AnalyticsEvent[];

const STATIC_PAGES = [
  "/",
  "/login",
  "/signup",
  "/dashboard",
  "/classes",
  "/learning",
  "/ai-assistant",
  "/notes",
  "/notes/ocr",
  "/calendar",
  "/advising_new",
  "/profile",
  "/settings",
  "/help",
  "/summary",
  "/discover",
  "/admin/analytics",
  "/other",
];
const COURSE_SECTIONS = [
  "due-dates",
  "learning",
  "notes",
  "summaries",
  "discover",
  "assignments",
  "flashcards",
];

export function normalizeAnalyticsPath(path: string): string {
  let pathname = path.split("?")[0].split("#")[0];
  if (pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  if (pathname === "") {
    pathname = "/";
  }
  if (STATIC_PAGES.includes(pathname)) {
    return pathname;
  }
  if (!pathname.startsWith("/")) {
    return "/other";
  }

  const parts = pathname.slice(1).split("/");
  const section = parts[0];
  const recordId = parts[1];
  if (!recordId) {
    return "/other";
  }

  if (section === "notes" && parts.length === 2) {
    return "/notes/[noteId]";
  }
  if (section === "share" && parts.length === 2) {
    return "/share/[shareId]";
  }
  if (section !== "courses") {
    return "/other";
  }
  if (parts.length === 2) {
    return "/courses/[courseId]";
  }

  const courseSection = parts[2];
  if (parts.length === 3 && COURSE_SECTIONS.includes(courseSection)) {
    return `/courses/[courseId]/${courseSection}`;
  }
  if (parts.length !== 4 || !parts[3]) {
    return "/other";
  }
  if (courseSection === "quizzes") {
    return "/courses/[courseId]/quizzes/[quizId]";
  }
  if (courseSection === "discover" && parts[3] === "blocks") {
    return "/courses/[courseId]/discover/blocks";
  }
  if (courseSection === "discover") {
    return "/courses/[courseId]/discover/[publicSetId]";
  }
  return "/other";
}

export function analyticsFileType(
  filename: string,
): EventProperties<"resource_upload_started">["file_type"] {
  const filenameParts = filename.split(".");
  const extension = filenameParts[filenameParts.length - 1].toLowerCase();

  switch (extension) {
    case "pdf":
      return "pdf";
    case "doc":
    case "docx":
      return "document";
    case "xls":
    case "xlsx":
    case "csv":
      return "spreadsheet";
    case "png":
    case "jpg":
    case "jpeg":
    case "webp":
      return "image";
    case "txt":
    case "md":
    case "py":
    case "js":
    case "ts":
    case "tsx":
    case "jsx":
    case "java":
    case "html":
    case "css":
      return "text";
    default:
      return "other";
  }
}

let attemptSequence = 0;

export function createAnalyticsAttemptId(): string {
  attemptSequence = attemptSequence + 1;
  return `${Date.now()}-${attemptSequence}`;
}
