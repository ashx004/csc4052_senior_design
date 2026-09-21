import { adminDb } from "@/src/library/firebaseAdmin";
import { courseCodesStructurallyEquivalent } from "@/src/library/advisingSchedule";

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
  return cache.find((course) =>
    courseCodesStructurallyEquivalent(courseCode, course.courseCode)
  );
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