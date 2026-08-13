import { normalizeCourseCode } from "./normalizeCourseCode";
import type { FlashcardCard, PublicStudySet, QuizQuestion } from "./types";

interface RawQuizSetData {
  name?: string;
  questions?: QuizQuestion[];
}

interface RawFlashcardSetData {
  name?: string;
  cards?: FlashcardCard[];
}

interface SanitizeStudySetParams {
  type: "quiz" | "flashcard";
  setData: RawQuizSetData | RawFlashcardSetData;
  courseCode: string;
  schoolDomain: string;
  creatorDisplayName: string;
}

// Builds a safe, self-contained public snapshot from an owner-scoped quiz or
// flashcard set document. Deliberately does NOT spread the raw set data —
// only the fields explicitly read below ever reach the returned object, so
// sourceDocKey (a MinIO key that embeds the owner's uid) and every other
// owner-private field (pinned, createdAt, updatedAt, questionTypes, uid-ish
// fields, etc.) are excluded by construction, not by a blocklist.
export function sanitizeStudySet(
  params: SanitizeStudySetParams
): Omit<PublicStudySet, "id" | "createdAt" | "updatedAt"> {
  const { type, setData, courseCode, schoolDomain, creatorDisplayName } = params;

  const title = (setData.name && setData.name.trim()) || "Untitled";

  const questions =
    type === "quiz" && Array.isArray((setData as RawQuizSetData).questions)
      ? (setData as RawQuizSetData).questions
      : undefined;

  const cards =
    type === "flashcard" && Array.isArray((setData as RawFlashcardSetData).cards)
      ? (setData as RawFlashcardSetData).cards
      : undefined;

  const itemCount = type === "quiz" ? questions?.length ?? 0 : cards?.length ?? 0;

  return {
    type,
    title,
    // Only the field matching `type` is ever included — Firestore rejects
    // `undefined` values, so the other one must be omitted entirely rather
    // than included as `field: undefined`.
    ...(type === "quiz" ? { questions: questions ?? [] } : {}),
    ...(type === "flashcard" ? { cards: cards ?? [] } : {}),
    itemCount,
    courseCode,
    normalizedCourseCode: normalizeCourseCode(courseCode),
    schoolDomain,
    creatorDisplayName,
    positiveVotes: 0,
    negativeVotes: 0,
    status: "active",
  };
}
