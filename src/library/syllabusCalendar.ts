import type { SyllabusDate, SyllabusDateKind } from "./syllabusInfo";

// Turns the dates read from a syllabus into calendar events. Everything here
// is pure (no Firestore, no clock unless passed in) so it can be tested;
// syllabusCalendarSync.ts does the actual saving.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_NAMES = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec";

function isRealDate(year: number, month: number, day: number): boolean {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function toIso(year: number, month: number, day: number): string | null {
  if (!isRealDate(year, month, day)) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The year a month/day with no year most likely means, given the course term ("Fall 2026"). */
function impliedYear(month: number, term: string, now: Date): number {
  const termYear = term.match(/\b(20\d{2})\b/)?.[1];
  const year = termYear ? Number(termYear) : now.getFullYear();
  // A fall term's January/February dates (winter finals, makeups) fall in the next calendar year.
  if (/fall|autumn/i.test(term) && month <= 4) return year + 1;
  return year;
}

/**
 * Best-effort conversion of a syllabus date ("2026-10-15", "Oct 15", "10/15",
 * "Tuesday, October 15th, 2026") to YYYY-MM-DD. Returns null when the syllabus
 * doesn't give a calendar day ("Week 3", "Finals week", "TBA").
 */
export function resolveSyllabusDate(text: string, term = "", now: Date = new Date()): string | null {
  const value = text.trim();
  if (!value) return null;

  const iso = value.match(ISO_DATE);
  if (iso) return toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const cleaned = value.replace(/\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?,?/gi, " ").replace(/(\d)(st|nd|rd|th)\b/gi, "$1");

  // "October 15, 2026" / "Oct 15"
  const monthFirst = cleaned.match(new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:\\s*,?\\s*(\\d{4}))?\\b`, "i"));
  if (monthFirst) {
    const month = MONTHS[monthFirst[1].toLowerCase()];
    const year = monthFirst[3] ? Number(monthFirst[3]) : impliedYear(month, term, now);
    return toIso(year, month, Number(monthFirst[2]));
  }

  // "15 October 2026"
  const dayFirst = cleaned.match(new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_NAMES})\\.?(?:\\s*,?\\s*(\\d{4}))?\\b`, "i"));
  if (dayFirst) {
    const month = MONTHS[dayFirst[2].toLowerCase()];
    const year = dayFirst[3] ? Number(dayFirst[3]) : impliedYear(month, term, now);
    return toIso(year, month, Number(dayFirst[1]));
  }

  // "10/15/2026", "10/15/26", "10/15" (US month/day order)
  const numeric = cleaned.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  if (numeric) {
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    let year = numeric[3] ? Number(numeric[3]) : impliedYear(month, term, now);
    if (numeric[3] && numeric[3].length === 2) year += 2000;
    return toIso(year, month, day);
  }

  return null;
}

const RANGE_WORD = "(?:-|to|through|thru|until)";

/**
 * Like resolveSyllabusDate, but understands a span of days: "Nov 25-27",
 * "November 25 - November 27, 2026", "11/25-11/27". `end` is null for a single day
 * (or a range that doesn't make sense, such as one that ends before it starts).
 */
export function resolveSyllabusRange(text: string, term = "", now: Date = new Date()): { start: string; end: string | null } | null {
  const value = text.trim().replace(/[\u2012-\u2015\u2212]/g, "-");
  const cleaned = value.replace(/(\d)(st|nd|rd|th)\b/gi, "$1");

  let start: string | null = null;
  let end: string | null = null;

  // "Nov 25-27" / "Nov 25 - 27, 2026"
  const sameMonth = cleaned.match(new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})\\s*${RANGE_WORD}\\s*(\\d{1,2})\\b(?:\\s*,?\\s*(\\d{4}))?`, "i"));
  // "Nov 25 - Dec 2"
  const twoMonths = cleaned.match(new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})\\s*${RANGE_WORD}\\s*(${MONTH_NAMES})\\.?\\s+(\\d{1,2})\\b(?:\\s*,?\\s*(\\d{4}))?`, "i"));
  // "11/25 - 11/27"
  const numeric = cleaned.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*-\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);

  const yearFor = (explicit: string | undefined, month: number) => {
    if (!explicit) return impliedYear(month, term, now);
    return explicit.length === 2 ? 2000 + Number(explicit) : Number(explicit);
  };

  if (twoMonths) {
    const m1 = MONTHS[twoMonths[1].toLowerCase()];
    const m2 = MONTHS[twoMonths[3].toLowerCase()];
    start = toIso(yearFor(twoMonths[5], m1), m1, Number(twoMonths[2]));
    end = toIso(yearFor(twoMonths[5], m2), m2, Number(twoMonths[4]));
  } else if (sameMonth) {
    const m = MONTHS[sameMonth[1].toLowerCase()];
    const year = yearFor(sameMonth[4], m);
    start = toIso(year, m, Number(sameMonth[2]));
    end = toIso(year, m, Number(sameMonth[3]));
  } else if (numeric) {
    const m1 = Number(numeric[1]);
    const m2 = Number(numeric[4]);
    start = toIso(yearFor(numeric[3] ?? numeric[6], m1), m1, Number(numeric[2]));
    end = toIso(yearFor(numeric[6] ?? numeric[3], m2), m2, Number(numeric[5]));
  }

  if (start) return { start, end: end && end > start ? end : null };
  const single = resolveSyllabusDate(text, term, now);
  return single ? { start: single, end: null } : null;
}

/** The calendar day after `date` (YYYY-MM-DD) - all-day events end on the next day. */
export function nextDay(date: string): string {
  const match = date.match(ISO_DATE);
  if (!match) return date;
  const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/** A syllabus date plus the calendar day it resolved to, if any. */
export interface ReviewedSyllabusDate extends SyllabusDate {
  /** YYYY-MM-DD, or "" when the syllabus's wording couldn't be placed on a day. */
  iso: string;
  /** YYYY-MM-DD last day for something spanning several days, or "" for a single day. */
  endIso: string;
  /** Whether the student wants this on their calendar. */
  addToCalendar: boolean;
}

/** Exams go on the calendar by default; everything else is the student's choice. */
export function defaultAddToCalendar(kind: SyllabusDateKind, iso: string): boolean {
  return kind === "exam" && !!iso;
}

/** An end date only counts when it is a real day after the start. */
function validEnd(start: string, end: string | undefined): string {
  return start && end && ISO_DATE.test(end) && isRealDate(Number(end.slice(0, 4)), Number(end.slice(5, 7)), Number(end.slice(8, 10))) && end > start ? end : "";
}

export function reviewSyllabusDates(dates: SyllabusDate[], term = "", now: Date = new Date()): ReviewedSyllabusDate[] {
  return dates.map((entry) => {
    const range = resolveSyllabusRange(entry.date, term, now);
    const iso = range?.start ?? "";
    // A saved or model-given end date wins over one read from the wording.
    const endIso = validEnd(iso, entry.endDate) || range?.end || "";
    return { ...entry, iso, endIso, addToCalendar: defaultAddToCalendar(entry.kind, iso) };
  });
}

/** Back to the plain shape stored on the course: the resolved day replaces the wording. */
export function storedSyllabusDates(dates: ReviewedSyllabusDate[]): SyllabusDate[] {
  return dates
    .filter((entry) => entry.title.trim())
    .map((entry) => {
      const date = (entry.iso || entry.date).trim();
      const endDate = validEnd(entry.iso, entry.endIso);
      return { date, ...(endDate ? { endDate } : {}), title: entry.title.trim(), kind: entry.kind };
    });
}

// FNV-1a: a stable, dependency-free 32-bit hash. Only used to make event IDs
// that stay the same when the same syllabus is imported again.
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function syllabusEventId(courseId: string, date: string, title: string): string {
  const key = `${date}|${title.trim().toLowerCase().replace(/\s+/g, " ")}`;
  return `syl_${courseId.replace(/[^A-Za-z0-9]/g, "").slice(0, 12)}_${hash(key)}`;
}

export type SyllabusCalendarKind = "exam" | "assignment" | "event";

export function calendarKindFor(kind: SyllabusDateKind): SyllabusCalendarKind {
  return kind === "exam" ? "exam" : kind === "assignment" ? "assignment" : "event";
}

export interface PlannedSyllabusEvent {
  id: string;
  date: string;
  kind: SyllabusCalendarKind;
  /** Fields for the event document (reminder fields are added when saving). */
  data: Record<string, unknown>;
}

/** The events to create for the entries the student ticked, one per day+title. */
export function planSyllabusEvents(
  dates: ReviewedSyllabusDate[],
  course: { courseId: string; classCode?: string; className?: string }
): PlannedSyllabusEvent[] {
  const label = (course.classCode || course.className || "").trim();
  const planned = new Map<string, PlannedSyllabusEvent>();
  for (const entry of dates) {
    if (!entry.addToCalendar || !entry.iso || !entry.title.trim()) continue;
    const id = syllabusEventId(course.courseId, entry.iso, entry.title);
    const kind = calendarKindFor(entry.kind);
    planned.set(id, {
      id,
      date: entry.iso,
      kind,
      data: {
        title: label ? `${label}: ${entry.title.trim()}` : entry.title.trim(),
        startTime: entry.iso,
        // All-day events end on the day after their last day.
        endTime: nextDay(validEnd(entry.iso, entry.endIso) || entry.iso),
        allDay: true,
        timeZone: null,
        location: null,
        description: course.className ? `From the ${course.className} syllabus.` : "From the course syllabus.",
        tone: kind === "exam" ? "rose" : kind === "assignment" ? "cream" : "sage",
        kind,
        classId: course.courseId,
        className: course.className || null,
        recurrence: "none",
        recurrenceUntil: null,
        reminderMinutes: 0,
        source: "local" as const,
        // Marks events that came from a syllabus so importing again replaces
        // them instead of piling up duplicates.
        origin: "syllabus",
      },
    });
  }
  return [...planned.values()];
}
