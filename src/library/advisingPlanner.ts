import { type TranscriptCourse } from "@/src/library/advisingSchedule";
import { CachedCourseOffering, isCourseOfferedInTerm, } from "@/src/library/advisingOfferingCache";

export type AcademicTermName =
  | "Fall"
  | "Winter"
  | "Spring"
  | "Summer";

export type AcademicTerm = {
  term: AcademicTermName;
  year: number;
};

const TERM_ORDER: AcademicTermName[] = [
  "Winter",
  "Spring",
  "Summer",
  "Fall",
];

function parseTranscriptTerm(
  term: string | null
): AcademicTerm | null {

  if (!term) {
    return null;
  }

  const termMatch = term.match(
    /\b(Fall|Winter|Spring|Summer)(?:\s*-\s*[^0-9]+)?\s+(\d{4})/i
  );

  if (!termMatch) {
    return null;
  }

  const rawTerm =
    termMatch[1].toLowerCase();

  let parsedTerm: AcademicTermName;

  if (rawTerm === "fall") {
    parsedTerm = "Fall";
  } else if (rawTerm === "winter") {
    parsedTerm = "Winter";
  } else if (rawTerm === "spring") {
    parsedTerm = "Spring";
  } else {
    parsedTerm = "Summer";
  }

  return {
    term: parsedTerm,
    year: Number(termMatch[2]),
  };
}


function termSortValue(
  academicTerm: AcademicTerm
): number {

  const index =
    TERM_ORDER.indexOf(
      academicTerm.term
    );

  return (
    academicTerm.year * 10 +
    index
  );
}


export function findLatestPlannedTranscriptTerm(
  courses: TranscriptCourse[]
): AcademicTerm | null {

  const terms = courses
    .filter(
      (course) =>
        course.status === "in-progress"
    )
    .map(
      (course) =>
        parseTranscriptTerm(course.term)
    )
    .filter(
      (
        term
      ): term is AcademicTerm =>
        term !== null
    );

  if (terms.length === 0) {
    return null;
  }

  return terms.reduce(
    (latest, current) =>
      termSortValue(current) >
      termSortValue(latest)
        ? current
        : latest
  );
}


export function nextAcademicTerm(
  current: AcademicTerm
): AcademicTerm {

  switch (current.term) {

    case "Fall":
      return {
        term: "Winter",
        year: current.year + 1,
      };

    case "Winter":
      return {
        term: "Spring",
        year: current.year,
      };

    case "Spring":
      return {
        term: "Summer",
        year: current.year,
      };

    case "Summer":
      return {
        term: "Fall",
        year: current.year,
      };
  }
}


export function buildFutureTerms(
  transcriptCourses: TranscriptCourse[],
  count = 8
): AcademicTerm[] {

  const latest =
    findLatestPlannedTranscriptTerm(
      transcriptCourses
    );

  let current: AcademicTerm;

  if (latest) {
    current = nextAcademicTerm(latest);
  } else {

    const now = new Date();

    current = {
      term: "Fall",
      year: now.getFullYear(),
    };
  }

  const terms: AcademicTerm[] = [];

  for (
    let i = 0;
    i < count;
    i++
  ) {
    terms.push(current);
    current =
      nextAcademicTerm(current);
  }

  return terms;
}


export type CourseAvailability = {
  courseCode: string;
  term: AcademicTermName;
  year: number;
  offered: boolean;
};

export function buildCourseAvailability(
  courseCodes: string[],
  futureTerms: AcademicTerm[],
  cache: CachedCourseOffering[]
): CourseAvailability[] {

  const availability:
    CourseAvailability[] = [];

  for (const courseCode of courseCodes) {

    for (const futureTerm of futureTerms) {

      const offered =
        isCourseOfferedInTerm(
          courseCode,
          futureTerm.term,
          futureTerm.year,
          cache
        );

      availability.push({
        courseCode,
        term: futureTerm.term,
        year: futureTerm.year,
        offered,
      });
    }
  }

  return availability;
}

