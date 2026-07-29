import { Term, TermInfo, normalizeCourseCode, parseCourseCode } from "@/src/library/academicTerm";
import { CourseOfferingRecord } from "@/src/library/courseOfferings";

// Deliberately separate from src/library/courseOfferings/ — that directory
// is the source-agnostic scraping/caching abstraction; this file is
// Catalyst-specific personalization logic (cross-referencing the student's
// own enrollment), which has nothing to do with where the offering data
// came from.

export interface StudentEnrollment {
  classCode: string;
  subject?: string;
}

export interface AdvisingCourse {
  courseCode: string;
  title: string;
  department: string;
  relevanceReason: "same-department" | "new";
  yearsOfferedThisTerm: number[];
  // Full per-term pattern (straight passthrough from CourseOfferingRecord) —
  // yearsOfferedThisTerm above stays the single most actionable fact for the
  // target term, but the scraper already captures all four terms, and
  // showing that a course is "usually offered Fall, Spring" helps a student
  // planning further out than just next term.
  offeredTerms: Record<Term, { offered: boolean; years: number[] }>;
}

export interface RecommendationResult {
  recommended: AdvisingCourse[];
  otherLikely: AdvisingCourse[];
  totalConsidered: number;
}

// There is no structured degree-plan/prerequisite data anywhere in this app
// (confirmed during planning) — "best suited" is derived from two signals
// that actually exist today: courses likely offered next term, and whether
// their department matches courses the student is already/has been in.
function isLikelyOffered(
  termData: { offered: boolean; years: number[] } | undefined,
  target: TermInfo
): boolean {
  if (!termData?.offered) return false;
  if (termData.years.includes(target.year)) return true;

  // The target year isn't listed yet (e.g. the source hasn't logged next
  // year's schedule) — fall back to "offered in most of the last 3 years"
  // as a reasonable predictor.
  const recentYears = [target.year - 1, target.year - 2, target.year - 3];
  return recentYears.filter((y) => termData.years.includes(y)).length >= 2;
}

export function recommendCourses(
  courses: CourseOfferingRecord[],
  enrollments: StudentEnrollment[],
  target: TermInfo
): RecommendationResult {
  const takenCodes = new Set(enrollments.map((e) => normalizeCourseCode(e.classCode)));
  const studentDepartments = new Set(
    enrollments
      .map((e) => e.subject ?? parseCourseCode(e.classCode)?.subject)
      .filter((subject): subject is string => Boolean(subject))
  );

  const recommended: AdvisingCourse[] = [];
  const otherLikely: AdvisingCourse[] = [];

  for (const course of courses) {
    const termData = course.offeredTerms[target.term];
    if (!isLikelyOffered(termData, target)) continue;
    if (takenCodes.has(normalizeCourseCode(course.courseCode))) continue;

    const department = parseCourseCode(course.courseCode)?.subject ?? course.courseCode.split(/\s+/)[0]?.toUpperCase() ?? "";
    const sameDepartment = studentDepartments.has(department);

    const entry: AdvisingCourse = {
      courseCode: course.courseCode,
      title: course.title,
      department,
      relevanceReason: sameDepartment ? "same-department" : "new",
      yearsOfferedThisTerm: termData!.years,
      offeredTerms: course.offeredTerms,
    };

    (sameDepartment ? recommended : otherLikely).push(entry);
  }

  return { recommended, otherLikely, totalConsidered: courses.length };
}

// The full otherLikely list can realistically span most of a school's
// catalog (thousands of rows) — this is applied server-side before the
// response is built, so the client never receives/renders more than one
// page at a time, and the AI panel's context never needs to enumerate it.
export function filterCourses(courses: AdvisingCourse[], q?: string, department?: string): AdvisingCourse[] {
  let result = courses;
  if (department) result = result.filter((c) => c.department === department);

  const needle = q?.trim().toLowerCase();
  if (needle) {
    result = result.filter(
      (c) => c.courseCode.toLowerCase().includes(needle) || c.title.toLowerCase().includes(needle)
    );
  }

  return result;
}

export function paginate<T>(items: T[], page: number, pageSize: number): { items: T[]; total: number } {
  const total = items.length;
  const start = Math.max(0, (page - 1) * pageSize);
  return { items: items.slice(start, start + pageSize), total };
}

export function getDepartments(courses: AdvisingCourse[]): string[] {
  return Array.from(new Set(courses.map((c) => c.department).filter(Boolean))).sort();
}
