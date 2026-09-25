/**
 * Normalize a course code for matching.
 * "CSC 4033" → "CSC4033"
 * "csc-4033" → "CSC4033"
 * "CSC  4033" → "CSC4033"
 */
export function normalizeCourseCode(code: string): string {
  return code.replace(/[\s\-_]+/g, "").toUpperCase();
}
