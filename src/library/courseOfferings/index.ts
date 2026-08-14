import { CourseOfferingSource } from "./types";
import { createProtohacksSource } from "./protohacksSource";

export * from "./types";
export { getCourseOfferings } from "./cache";
export { getCourseOfferingSourceForDomain } from "./registry";

// Used when a student hasn't picked a university yet — a sane default since
// LA Tech is this app's only real school context today (confirmed with the
// user). Once a student picks a university on their Profile, per-student
// lookup goes through src/library/getStudentUniversitySource.ts instead,
// which consults registry.ts's domain map.
export function getDefaultCourseOfferingSource(): CourseOfferingSource {
  return createProtohacksSource();
}
