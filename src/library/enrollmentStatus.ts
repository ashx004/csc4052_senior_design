export type EnrollmentStatus = "planned" | "in-progress" | "completed";

// Additive field — enrollment docs created before this existed have no
// `status` at all. Treat those as "in-progress" (today's implicit meaning
// of just being in the enrollment collection) rather than requiring a
// backfill of existing Firestore data.
export function getEnrollmentStatus(e: { status?: string }): EnrollmentStatus {
  return e.status === "completed" || e.status === "planned" ? e.status : "in-progress";
}
