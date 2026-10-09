import { extractFirstJsonObject } from "./stripThinkLeak";

export type SyllabusDateKind = "exam" | "assignment" | "holiday" | "other";

export interface SyllabusDate {
  /** ISO date (YYYY-MM-DD) when the syllabus gives an exact day, otherwise the text it uses ("Week 3"). */
  date: string;
  title: string;
  kind: SyllabusDateKind;
}

export interface SyllabusInfo {
  classSchedule: string;
  time: string;
  classRoom: string;
  classDescription: string;
  facultyName: string;
  facultyEmail: string;
  facultyOfficeNumber: string;
  facultyPhoneNumber: string;
  officeHours: string;
  textbooks: string;
  grading: string;
  dates: SyllabusDate[];
}

/** Fields that live directly on the enrollment document. */
export const SYLLABUS_ENROLLMENT_FIELDS = [
  "classSchedule",
  "time",
  "classRoom",
  "classDescription",
  "facultyName",
  "facultyEmail",
  "facultyOfficeNumber",
  "facultyPhoneNumber",
] as const;

export type SyllabusEnrollmentField = (typeof SYLLABUS_ENROLLMENT_FIELDS)[number];

export const SYLLABUS_SYSTEM_PROMPT = `You read a college course syllabus and pull out the facts a student needs. Use ONLY what the syllabus says; if something is not stated, use an empty string (or an empty list). Never guess.

Reply with a single JSON object and nothing else, with exactly these keys:
{
  "classSchedule": "meeting days, e.g. Mon/Wed/Fri",
  "time": "meeting time, e.g. 10:00 - 10:50 AM",
  "classRoom": "building and room",
  "classDescription": "one or two sentences on what the course covers",
  "facultyName": "instructor name",
  "facultyEmail": "instructor email",
  "facultyOfficeNumber": "instructor office",
  "facultyPhoneNumber": "instructor phone",
  "officeHours": "office hours, e.g. Tue 2-4 PM",
  "textbooks": "required texts, one line",
  "grading": "grade breakdown, one line, e.g. Exams 40%, Homework 30%, Project 30%",
  "dates": [{"date": "YYYY-MM-DD or the syllabus's own wording", "title": "what is due or happening", "kind": "exam | assignment | holiday | other"}]
}
List dates in chronological order, at most 40 of them; include exams, quizzes, project and assignment deadlines, and no-class days.`;

const asText = (value: unknown, max: number): string => {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim().slice(0, max);
  if (Array.isArray(value)) return value.map((v) => asText(v, max)).filter(Boolean).join("; ").slice(0, max);
  if (typeof value === "number") return String(value);
  return "";
};

const KINDS: SyllabusDateKind[] = ["exam", "assignment", "holiday", "other"];

export function emptySyllabusInfo(): SyllabusInfo {
  return {
    classSchedule: "",
    time: "",
    classRoom: "",
    classDescription: "",
    facultyName: "",
    facultyEmail: "",
    facultyOfficeNumber: "",
    facultyPhoneNumber: "",
    officeHours: "",
    textbooks: "",
    grading: "",
    dates: [],
  };
}

/** Turns the model's reply into a clean SyllabusInfo; anything unusable becomes "". */
export function parseSyllabusResponse(raw: string): SyllabusInfo {
  const info = emptySyllabusInfo();
  let data: unknown;
  try {
    data = JSON.parse(extractFirstJsonObject(raw.replace(/```(?:json)?/gi, "")));
  } catch {
    return info;
  }
  if (!data || typeof data !== "object") return info;
  const record = data as Record<string, unknown>;

  info.classSchedule = asText(record.classSchedule, 80);
  info.time = asText(record.time, 60);
  info.classRoom = asText(record.classRoom, 80);
  info.classDescription = asText(record.classDescription, 600);
  info.facultyName = asText(record.facultyName, 80);
  info.facultyEmail = asText(record.facultyEmail, 120);
  info.facultyOfficeNumber = asText(record.facultyOfficeNumber, 60);
  info.facultyPhoneNumber = asText(record.facultyPhoneNumber, 40);
  info.officeHours = asText(record.officeHours, 200);
  info.textbooks = asText(record.textbooks, 400);
  info.grading = asText(record.grading, 400);

  if (info.facultyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(info.facultyEmail)) info.facultyEmail = "";

  if (Array.isArray(record.dates)) {
    for (const entry of record.dates) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const date = asText(e.date, 40);
      const title = asText(e.title, 140);
      if (!date || !title) continue;
      const kind = KINDS.includes(e.kind as SyllabusDateKind) ? (e.kind as SyllabusDateKind) : "other";
      info.dates.push({ date, title, kind });
      if (info.dates.length >= 40) break;
    }
  }
  return info;
}
