import type { GeneratedAdvisingSchedule } from "@/src/library/advisingSchemas";
import type { AcademicTerm, CourseAvailability } from "@/src/library/advisingPlanner";

// University rule: normally at most 12 credit hours per quarter,
// occasionally 13. Change these two numbers if the policy changes.
export const PREFERRED_MAX_CREDITS = 12;
export const HARD_MAX_CREDITS = 13;

// Used only when the model leaves a course's creditHours null.
const DEFAULT_CREDITS = 3;

type ScheduleTerm = GeneratedAdvisingSchedule["terms"][number];
type ScheduleCourse = ScheduleTerm["courses"][number];

const normalize = (code: string) => code.replace(/\s+/g, "").toUpperCase();
const creditsOf = (course: ScheduleCourse) => course.creditHours ?? DEFAULT_CREDITS;
const totalOf = (term: ScheduleTerm) => term.courses.reduce((sum: number, c: ScheduleCourse) => sum + creditsOf(c), 0);
const labelOf = (term: { term: string; year: number }) => `${term.term} ${term.year}`;

// The prompt asks for the earliest reasonable terms, but the model doesn't
// always do it (it put FYE 100, offered every quarter, in Spring with Winter
// empty). Pull every course into the earliest term where it is offered and
// still fits under the usual limit. Moving earlier never breaks a
// prerequisite, because only courses whose prerequisites are already on the
// transcript are ever scheduled - no scheduled course depends on another.
export function moveCoursesToEarliestTerms(
  schedule: GeneratedAdvisingSchedule,
  futureTerms: AcademicTerm[],
  availability: CourseAvailability[]
): ScheduleTerm[] {

  const terms: ScheduleTerm[] = futureTerms.map((futureTerm) => ({
    term: futureTerm.term,
    year: futureTerm.year,
    courses: [],
  }));

  const isOffered = (code: string, term: ScheduleTerm) =>
    availability.some(
      (a) =>
        a.offered &&
        a.term === term.term &&
        a.year === term.year &&
        normalize(a.courseCode) === normalize(code)
    );

  const scheduled = futureTerms.flatMap((futureTerm) =>
    schedule.terms.find(
      (t: ScheduleTerm) => t.term === futureTerm.term && t.year === futureTerm.year
    )?.courses ?? []
  );

  for (const course of scheduled) {
    const originalIndex = terms.findIndex((term) =>
      schedule.terms.some(
        (t: ScheduleTerm) =>
          t.term === term.term && t.year === term.year && t.courses.includes(course)
      )
    );

    const earliest = terms.findIndex(
      (term, index) =>
        index <= originalIndex &&
        isOffered(course.courseCode, term) &&
        totalOf(term) + creditsOf(course) <= PREFERRED_MAX_CREDITS
    );

    terms[earliest === -1 ? originalIndex : earliest].courses.push(course);
  }

  return terms.filter((t: ScheduleTerm) => t.courses.length > 0);
}

// The model cannot be trusted to add up credit hours, so this runs in code
// after validation. Any term over 12 hours has a course moved to a LATER term
// where it is offered (moving later never breaks a prerequisite, because only
// courses whose prerequisites are already met are ever scheduled).
//  - 13 hours is allowed if fixing it would only mean adding a brand-new term.
//  - More than 13 is always fixed if any later term can take the course.
export function enforceTermCreditLimit(
  schedule: GeneratedAdvisingSchedule,
  futureTerms: AcademicTerm[],
  availability: CourseAvailability[]
): { terms: ScheduleTerm[]; warnings: string[] } {

  const warnings: string[] = [];

  // One entry per future term, in order, so a course can move into a term
  // the model left empty.
  const terms: ScheduleTerm[] = futureTerms.map((futureTerm) => {
    const existing = schedule.terms.find(
      (t: ScheduleTerm) => t.term === futureTerm.term && t.year === futureTerm.year
    );
    return {
      term: futureTerm.term,
      year: futureTerm.year,
      courses: existing ? [...existing.courses] : [],
    };
  });

  const isOffered = (code: string, term: ScheduleTerm) =>
    availability.some(
      (a) =>
        a.offered &&
        a.term === term.term &&
        a.year === term.year &&
        normalize(a.courseCode) === normalize(code)
    );

  // Find (course, destination) to move out of terms[i]. Later terms only.
  const findMove = (i: number, mustFix: boolean) => {
    const source = terms[i];
    for (const limit of [PREFERRED_MAX_CREDITS, HARD_MAX_CREDITS]) {
      // A 13-hour destination is only a last resort for a term that is over 13.
      if (limit === HARD_MAX_CREDITS && !mustFix) break;

      for (let c = source.courses.length - 1; c >= 0; c--) {
        const course = source.courses[c];
        for (let j = i + 1; j < terms.length; j++) {
          const destination = terms[j];
          // Do not extend the schedule with a new term just to get from 13 to 12.
          if (!mustFix && destination.courses.length === 0) continue;
          if (!isOffered(course.courseCode, destination)) continue;
          if (totalOf(destination) + creditsOf(course) > limit) continue;
          return { c, j };
        }
      }
    }
    return null;
  };

  for (let i = 0; i < terms.length; i++) {
    while (totalOf(terms[i]) > PREFERRED_MAX_CREDITS) {
      const mustFix = totalOf(terms[i]) > HARD_MAX_CREDITS;
      const move = findMove(i, mustFix);
      if (!move) break;

      const [course] = terms[i].courses.splice(move.c, 1);
      terms[move.j].courses.push(course);
      warnings.push(
        `Moved ${course.courseCode} from ${labelOf(terms[i])} to ${labelOf(terms[move.j])} to stay within the ${PREFERRED_MAX_CREDITS}-credit-hour limit per quarter.`
      );
    }
  }

  for (const term of terms) {
    const total = totalOf(term);
    if (total > HARD_MAX_CREDITS) {
      warnings.push(
        `${labelOf(term)} has ${total} credit hours, above the ${HARD_MAX_CREDITS}-hour maximum, and no later term could take a course. Please review this term with your advisor.`
      );
    } else if (total > PREFERRED_MAX_CREDITS) {
      warnings.push(
        `${labelOf(term)} has ${total} credit hours, above the usual ${PREFERRED_MAX_CREDITS}. Taking ${HARD_MAX_CREDITS} is only allowed occasionally, so confirm with your advisor.`
      );
    }
  }

  // Drop terms that ended up empty so the schedule stays compact.
  return { terms: terms.filter((t: ScheduleTerm) => t.courses.length > 0), warnings };
}