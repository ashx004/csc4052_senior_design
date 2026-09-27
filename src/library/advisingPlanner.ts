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


// The quarter a date falls in, using the quarter dates printed on Louisiana
// Tech transcripts (Fall 09/01-11/22, Winter 11/23-03/07, Spring
// 03/08-05/25, Summer 05/26-08/31). Winter spans New Year, so a late-November
// or December date belongs to the NEXT year's Winter.
export function academicTermForDate(date: Date): AcademicTerm {
  const year = date.getFullYear();
  const monthDay = (date.getMonth() + 1) * 100 + date.getDate(); // e.g. 1123

  if (monthDay >= 1123) return { term: "Winter", year: year + 1 };
  if (monthDay >= 901) return { term: "Fall", year };
  if (monthDay >= 526) return { term: "Summer", year };
  if (monthDay >= 308) return { term: "Spring", year };
  return { term: "Winter", year };
}

// The latest quarter any course on the transcript belongs to - used when no
// course is marked in-progress (e.g. a student between quarters).
function findLatestTranscriptTerm(courses: TranscriptCourse[]): AcademicTerm | null {
  const terms = courses
    .map((course) => parseTranscriptTerm(course.term))
    .filter((term): term is AcademicTerm => term !== null);

  if (terms.length === 0) return null;

  return terms.reduce((latest, current) =>
    termSortValue(current) > termSortValue(latest) ? current : latest
  );
}

// The schedule starts at the quarter after the student's current courses:
// the in-progress quarter on the transcript, or failing that its latest
// quarter. It never starts in or before today's quarter, since those classes
// are already underway or over - only future quarters are planned.
export function buildFutureTerms(
  transcriptCourses: TranscriptCourse[],
  count = 8,
  today: Date = new Date()
): AcademicTerm[] {

  const latest =
    findLatestPlannedTranscriptTerm(transcriptCourses) ??
    findLatestTranscriptTerm(transcriptCourses);

  const afterToday = nextAcademicTerm(academicTermForDate(today));
  const afterTranscript = latest ? nextAcademicTerm(latest) : afterToday;

  let current =
    termSortValue(afterTranscript) > termSortValue(afterToday)
      ? afterTranscript
      : afterToday;

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

