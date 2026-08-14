import { adminDb } from "@/src/library/firebaseAdmin";

export type OfferedTerm = {
  offered: boolean;
  years: number[];
};

export type CachedCourseOffering = {
  courseCode: string;
  offeredTerms: Record<string, OfferedTerm>;
};

function normalizeCourseCode(
  courseCode: string
): string {
  return courseCode
    .replace(/\s+/g, "")
    .toUpperCase();
}

export async function loadCourseOfferingCache(): Promise<
  CachedCourseOffering[]
> {
  const chunksRef = adminDb
    .collection("courseOfferingCache")
    .doc("protohacks-latech")
    .collection("chunks");

  const snapshot = await chunksRef.get();

  const courses: CachedCourseOffering[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();

    if (!Array.isArray(data.courses)) { continue; }

    for (const course of data.courses) {
      if (
        typeof course?.courseCode !== "string" ||
        typeof course?.offeredTerms !== "object" ||
        course.offeredTerms === null
      ) {
        continue;
      }

      courses.push({
        courseCode: course.courseCode,
        offeredTerms: course.offeredTerms,
      });
    }
  }

  return courses;
}

export function findCachedCourse(
  courseCode: string,
  cache: CachedCourseOffering[]
): CachedCourseOffering | undefined {

  const target = normalizeCourseCode(courseCode);

  // Try exact match first
  const exactMatch = cache.find((course) => normalizeCourseCode(course.courseCode) === target);

  if (exactMatch) { return exactMatch; }

  // Handle old 3-digit curriculum codes
  // versus newer 4-digit cache codes.
  //
  // Example:
  // CSC 493  -> CSC 4933
  // ENGL 101 -> ENGL 1013
  
  const prefixMatch = cache.find(
    (course) => { const cachedCode = normalizeCourseCode(course.courseCode);

      return (
        cachedCode.length === target.length + 1 && cachedCode.startsWith(target)
      );
    }
  );

  return prefixMatch;
}

export function isCourseOfferedInTerm(
  courseCode: string,
  term: string,
  _year: number,
  cache: CachedCourseOffering[]
): boolean {

  const cachedCourse = findCachedCourse(courseCode, cache);

  if (!cachedCourse) { return false; }

  const termData = cachedCourse.offeredTerms[term];

  if (!termData) { return false; }

  return termData.offered === true;
}