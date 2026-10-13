import { normalizeCourseCode } from "@/src/library/academicTerm";

// Turns what the scan read from a student's transcript and curriculum sheet into
// something they can scan at a glance: credits earned, GPA, which requirements
// are met, and what to double-check. Pure, so it is unit-tested.
//
// Only requirements that name courses (a specific course, or choose-from-a-list)
// can be checked against the transcript. Credit totals, open electives and
// free-text rules are shown as "to plan": the sheet doesn't say which courses
// count, so guessing would mislead.

export interface TranscriptCourse {
  courseCode: string;
  courseTitle: string | null;
  term: string | null;
  creditHours: number | null;
  grade: string | null;
  status: "completed" | "in-progress" | "withdrawn" | "failed" | "transfer" | "unknown";
}

export interface TranscriptData {
  studentName?: string | null;
  major?: string | null;
  concentration?: string | null;
  catalogYear?: string | null;
  courses: TranscriptCourse[];
  warnings?: string[];
}

export interface CurriculumRequirement {
  requirementId: string;
  requirementName: string;
  description?: string;
  requirementType: "specific-course" | "choose-from-list" | "open-elective" | "credit-requirement" | "other";
  numberRequired: number | null;
  creditsRequired: number | null;
  courseCode: string | null;
  courseTitle?: string | null;
  courseOptions: { courseCode: string; courseTitle?: string | null }[];
  optionsExplicitlyListed?: boolean;
}

export interface CurriculumData {
  programName?: string | null;
  degreeName?: string | null;
  catalogYear?: string | null;
  totalDegreeCredits: number | null;
  requirements: CurriculumRequirement[];
  concentrations?: { concentrationName: string; totalCredits?: number | null; requirements: CurriculumRequirement[] }[];
  warnings?: string[];
}

export type RequirementState = "done" | "in-progress" | "remaining" | "review";

export interface RequirementProgress {
  id: string;
  name: string;
  group: "program" | "concentration";
  state: RequirementState;
  /** One short line: what was found, or what is still needed. */
  detail: string;
  /** Transcript course codes that satisfy (or are working toward) it. */
  matched: string[];
}

export interface TermGroup {
  label: string;
  courses: TranscriptCourse[];
  credits: number;
}

export interface ProgressSummary {
  creditsEarned: number;
  creditsInProgress: number;
  creditsRequired: number | null;
  /** 0-100 of the degree's credits earned, or null when the sheet gave no total. */
  percentEarned: number | null;
  gpa: number | null;
  requirements: RequirementProgress[];
  counts: Record<RequirementState, number>;
  terms: TermGroup[];
  /** Plain-language things worth a second look. */
  attention: string[];
}

const GRADE_POINTS: Record<string, number> = {
  "A+": 4, A: 4, "A-": 3.7, "B+": 3.3, B: 3, "B-": 2.7, "C+": 2.3, C: 2, "C-": 1.7, "D+": 1.3, D: 1, "D-": 0.7, F: 0,
};

const cleanGrade = (grade: string | null) => (grade ?? "").trim().toUpperCase();

/** Grade points for a letter grade, or null for P/CR/IP/W and anything that isn't a letter. */
export function gradePoints(grade: string | null): number | null {
  const points = GRADE_POINTS[cleanGrade(grade)];
  return points === undefined ? null : points;
}

/** Credit was earned: completed or transferred, and not failed or withdrawn. */
export function earnedCredit(course: TranscriptCourse): boolean {
  if (course.status !== "completed" && course.status !== "transfer") return false;
  const grade = cleanGrade(course.grade);
  return grade !== "F" && grade !== "W" && grade !== "IP";
}

export const isInProgress = (course: TranscriptCourse) => course.status === "in-progress" || cleanGrade(course.grade) === "IP";

const SEASON_ORDER: Record<string, number> = { winter: 0, spring: 1, summer: 2, fall: 3 };

/** Calendar order for labels like "Fall 2023". Unparseable terms sort first (credit with no term, such as transfer). */
export function termSortKey(label: string): number {
  const year = /(\d{4})/.exec(label)?.[1];
  if (!year) return -1;
  const season = Object.keys(SEASON_ORDER).find((name) => label.toLowerCase().includes(name));
  return Number(year) * 10 + (season ? SEASON_ORDER[season] : 0);
}

export function groupByTerm(courses: TranscriptCourse[]): TermGroup[] {
  const groups = new Map<string, TranscriptCourse[]>();
  for (const course of courses) {
    const label = course.term?.trim() || "No term listed";
    groups.set(label, [...(groups.get(label) ?? []), course]);
  }
  return [...groups.entries()]
    .map(([label, list]) => ({ label, courses: list, credits: list.filter((c) => earnedCredit(c) || isInProgress(c)).reduce((sum, c) => sum + (c.creditHours ?? 0), 0) }))
    .sort((a, b) => termSortKey(a.label) - termSortKey(b.label) || a.label.localeCompare(b.label));
}

function findConcentration(curriculum: CurriculumData, name: string | null | undefined) {
  const wanted = (name ?? "").trim().toLowerCase();
  if (!wanted) return null;
  return curriculum.concentrations?.find((c) => c.concentrationName.trim().toLowerCase() === wanted)
    ?? curriculum.concentrations?.find((c) => wanted.includes(c.concentrationName.trim().toLowerCase()) || c.concentrationName.trim().toLowerCase().includes(wanted))
    ?? null;
}

function evaluate(
  requirement: CurriculumRequirement,
  group: RequirementProgress["group"],
  earned: Map<string, TranscriptCourse>,
  inProgress: Map<string, TranscriptCourse>,
): RequirementProgress {
  const base = { id: requirement.requirementId, name: requirement.requirementName, group };
  const label = (code: string) => (earned.get(code) ?? inProgress.get(code))?.courseCode ?? code;

  if (requirement.requirementType === "specific-course" && requirement.courseCode) {
    const code = normalizeCourseCode(requirement.courseCode);
    if (earned.has(code)) return { ...base, state: "done", detail: `Completed ${label(code)}`, matched: [label(code)] };
    if (inProgress.has(code)) return { ...base, state: "in-progress", detail: `${label(code)} is in progress`, matched: [label(code)] };
    return { ...base, state: "remaining", detail: `Still needs ${requirement.courseCode}`, matched: [] };
  }

  if (requirement.requirementType === "choose-from-list" && requirement.courseOptions.length > 0) {
    const need = Math.max(1, requirement.numberRequired ?? 1);
    const options = requirement.courseOptions.map((o) => normalizeCourseCode(o.courseCode));
    const done = options.filter((code) => earned.has(code));
    const ongoing = options.filter((code) => inProgress.has(code) && !earned.has(code));
    const matched = [...done, ...ongoing].map(label);
    if (done.length >= need) return { ...base, state: "done", detail: `${done.length} of ${need} done: ${done.map(label).join(", ")}`, matched };
    if (done.length + ongoing.length >= need) return { ...base, state: "in-progress", detail: `${done.length} done, ${ongoing.length} in progress, of ${need} needed`, matched };
    const left = need - done.length - ongoing.length;
    return { ...base, state: "remaining", detail: `Choose ${left} more from ${options.length} options${matched.length ? ` (have ${matched.join(", ")})` : ""}`, matched };
  }

  const credits = requirement.creditsRequired ? `${requirement.creditsRequired} credits` : requirement.numberRequired ? `${requirement.numberRequired} courses` : null;
  return { ...base, state: "review", detail: credits ? `${credits} - Catalyst can't tell which courses count, so plan this one yourself` : "Check this one against your curriculum sheet", matched: [] };
}

const UNREADABLE_TRANSFER = /^UNREADABLE_TRANSFER_ROWS: (\d+) rows totaling ([\d.]+) credit hours/;

/** Warnings the scan produced, reworded for a student, without internal markers or repeats. */
export function friendlyWarnings(warnings: string[] | undefined): string[] {
  const out: string[] = [];
  for (const raw of warnings ?? []) {
    const unreadable = UNREADABLE_TRANSFER.exec(raw);
    const text = unreadable
      ? `${unreadable[1]} transfer ${Number(unreadable[1]) === 1 ? "row" : "rows"} (${unreadable[2]} credits) couldn't be read from your transcript. Add them with "Add a completed course" so they count.`
      : raw.trim();
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

export function summarizeProgress(transcript: TranscriptData, curriculum: CurriculumData): ProgressSummary {
  const courses = transcript.courses ?? [];
  const earned = new Map<string, TranscriptCourse>();
  const inProgress = new Map<string, TranscriptCourse>();
  for (const course of courses) {
    const code = normalizeCourseCode(course.courseCode);
    if (!code) continue;
    if (earnedCredit(course)) earned.set(code, course);
    else if (isInProgress(course)) inProgress.set(code, course);
  }

  const creditsEarned = courses.filter(earnedCredit).reduce((sum, c) => sum + (c.creditHours ?? 0), 0);
  const creditsInProgress = courses.filter((c) => !earnedCredit(c) && isInProgress(c)).reduce((sum, c) => sum + (c.creditHours ?? 0), 0);

  // GPA over graded courses only (P/CR/IP/W carry no points), weighted by credit hours.
  const graded = courses.filter((c) => (c.status === "completed" || c.status === "failed") && gradePoints(c.grade) !== null && (c.creditHours ?? 0) > 0);
  const gradedCredits = graded.reduce((sum, c) => sum + (c.creditHours ?? 0), 0);
  const gpa = gradedCredits > 0 ? graded.reduce((sum, c) => sum + gradePoints(c.grade)! * (c.creditHours ?? 0), 0) / gradedCredits : null;

  const concentration = findConcentration(curriculum, transcript.concentration);
  const requirements = [
    ...curriculum.requirements.map((r) => evaluate(r, "program", earned, inProgress)),
    ...(concentration?.requirements ?? []).map((r) => evaluate(r, "concentration", earned, inProgress)),
  ];
  const counts: Record<RequirementState, number> = { done: 0, "in-progress": 0, remaining: 0, review: 0 };
  for (const requirement of requirements) counts[requirement.state] += 1;

  const creditsRequired = curriculum.totalDegreeCredits && curriculum.totalDegreeCredits > 0 ? curriculum.totalDegreeCredits : null;
  const attention = [...friendlyWarnings(transcript.warnings), ...friendlyWarnings(curriculum.warnings)];
  if (transcript.concentration && !concentration && (curriculum.concentrations?.length ?? 0) > 0) {
    attention.push(`Your transcript lists the concentration "${transcript.concentration}", but it doesn't match one on the curriculum sheet, so its requirements aren't shown.`);
  }

  return {
    creditsEarned,
    creditsInProgress,
    creditsRequired,
    percentEarned: creditsRequired ? Math.min(100, Math.round((creditsEarned / creditsRequired) * 100)) : null,
    gpa: gpa === null ? null : Math.round(gpa * 100) / 100,
    requirements,
    counts,
    terms: groupByTerm(courses),
    attention,
  };
}
