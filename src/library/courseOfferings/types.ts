import { Term } from "@/src/library/academicTerm";

export interface CourseOfferingRecord {
  courseCode: string;
  title: string;
  offeredTerms: Record<Term, { offered: boolean; years: number[] }>;
}

export interface CourseOfferingSnapshot {
  sourceId: string;
  sourceUrl: string;
  fetchedAt: Date;
  courses: CourseOfferingRecord[];
}

// The seam that keeps this feature non-university-specific: everything
// outside this directory depends only on this interface, never on how the
// data is actually obtained. Supporting a different school later means
// writing a new file that implements this interface (e.g. its own scraper,
// or a real API client if one ever exists) and registering it in
// registry.ts's domain map — no changes anywhere else in the app.
export interface CourseOfferingSource {
  id: string;
  fetch(): Promise<CourseOfferingSnapshot>;
}
