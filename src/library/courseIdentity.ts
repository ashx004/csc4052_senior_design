import { parseCourseCode } from "./academicTerm";

export const MAX_COURSE_CODE_LENGTH = 24;
export const MAX_COURSE_NAME_LENGTH = 120;

export type CourseIdentityUpdate =
  | {
      ok: true;
      classCode: string;
      className: string;
      /** Derived from the code; null means "no longer parseable, remove it". */
      subject: string | null;
      courseNumber: string | null;
    }
  | { ok: false; error: string };

/** Validates a renamed course and derives the structured mirrors of its code. */
export function buildCourseIdentityUpdate(input: { classCode: string; className: string }): CourseIdentityUpdate {
  const classCode = input.classCode.replace(/\s+/g, " ").trim();
  const className = input.className.replace(/\s+/g, " ").trim();
  if (!classCode) return { ok: false, error: "Enter a course code, like CSC 4550." };
  if (!className) return { ok: false, error: "Enter a course title." };
  if (classCode.length > MAX_COURSE_CODE_LENGTH) return { ok: false, error: `The course code can be at most ${MAX_COURSE_CODE_LENGTH} characters.` };
  if (className.length > MAX_COURSE_NAME_LENGTH) return { ok: false, error: `The title can be at most ${MAX_COURSE_NAME_LENGTH} characters.` };
  const parsed = parseCourseCode(classCode);
  return { ok: true, classCode, className, subject: parsed?.subject ?? null, courseNumber: parsed?.number ?? null };
}
