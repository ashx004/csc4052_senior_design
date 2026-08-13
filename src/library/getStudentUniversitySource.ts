import { firestoreGet } from "@/src/library/firestoreRest";
import {
  CourseOfferingSource,
  getDefaultCourseOfferingSource,
  getCourseOfferingSourceForDomain,
} from "@/src/library/courseOfferings";

export type StudentUniversitySource = {
  source: CourseOfferingSource | null;
  unsupported: boolean;
  university?: { name: string; domain: string };
};

// Shared by /api/advising and /api/courses/search — both need to know which
// school's course data to use for the signed-in student.
export async function getStudentCourseOfferingSource(
  uid: string,
  idToken: string
): Promise<StudentUniversitySource> {
  const data = await firestoreGet(idToken, "users", uid);
  const domain = typeof data?.universityDomain === "string" ? data.universityDomain : undefined;
  const name = typeof data?.universityName === "string" ? data.universityName : undefined;

  if (!domain) {
    // No university chosen yet — default to LA Tech's data, since that's
    // this app's only real school context today (confirmed with the user).
    return { source: getDefaultCourseOfferingSource(), unsupported: false };
  }

  const matched = getCourseOfferingSourceForDomain(domain);
  const university = { name: name ?? domain, domain };

  if (!matched) {
    // A real, distinct state from "scrape failed" — this school genuinely
    // has no adapter yet, so the UI should say so honestly rather than
    // implying a transient error.
    return { source: null, unsupported: true, university };
  }

  return { source: matched, unsupported: false, university };
}
