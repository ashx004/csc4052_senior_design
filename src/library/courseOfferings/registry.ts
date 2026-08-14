import { CourseOfferingSource } from "./types";
import { createProtohacksSource } from "./protohacksSource";

// Maps a university's domain (as returned by the Hipolabs university
// directory, see src/library/universityDirectory.ts) to a factory for its
// CourseOfferingSource. Only LA Tech has a real adapter today — a school
// this app doesn't recognize here gets an honest "not supported yet" state
// (src/library/getStudentUniversitySource.ts) rather than fake/empty data.
// Adding a school later means writing a new CourseOfferingSource
// implementation and adding one line here — no changes anywhere else.
const SOURCES_BY_DOMAIN: Record<string, () => CourseOfferingSource> = {
  "latech.edu": createProtohacksSource, // confirmed live via Hipolabs during planning
};

export function getCourseOfferingSourceForDomain(domain: string | undefined): CourseOfferingSource | null {
  if (!domain) return null;
  return SOURCES_BY_DOMAIN[domain.toLowerCase()]?.() ?? null;
}
