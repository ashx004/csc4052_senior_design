import type { Timestamp, FieldValue } from "firebase/firestore";

// Visibility for quiz/flashcard sets
export type StudySetVisibility = "public" | "private";

// Reuse the existing quiz question shape (matches
// src/app/(course)/courses/[courseId]/quizzes/[quizId]/page.tsx)
export interface QuizQuestion {
  id: string;
  type: "multiple_choice" | "true_false" | "matching";
  question: string;
  options: string[];
  correctAnswer: string;
  matchingGroupId?: string;
}

export interface FlashcardCard {
  question: string;
  answer: string;
}

// What gets stored in the top-level publicStudySets collection
export interface PublicStudySet {
  id?: string; // Firestore doc ID
  type: "quiz" | "flashcard";
  title: string;
  // For quizzes: the questions array (same shape as existing quiz questions)
  questions?: QuizQuestion[];
  // For flashcards: the cards array
  cards?: FlashcardCard[];
  itemCount: number;
  courseCode: string; // display value, e.g. "CSC 4033"
  normalizedCourseCode: string; // e.g. "CSC4033"
  schoolDomain: string; // e.g. "latech.edu" — hardcoded to La Tech for now
  creatorDisplayName: string; // "Anonymous" by default, or opted-in name
  positiveVotes: number;
  negativeVotes: number;
  status: "active" | "deleted";
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
  // Private mapping — stored in a SEPARATE subcollection, not on this doc
}

// Stored at publicStudySets/{setId}/ownerMapping/{mappingId} — intended to
// stay owner-only. NOTE: this repo has no committed firestore.rules, so this
// separation is not actually enforced yet — see the security note in
// publishStudySet.ts.
export interface OwnerMapping {
  ownerUid: string;
  originalPath: string; // e.g. "users/{uid}/enrollment/{courseId}/quizSets/{quizId}"
  publishedAt: Timestamp | FieldValue;
}

// Vote record — stored at publicStudySets/{setId}/votes/{voterId}
// `voterId` is the voting user's uid (kept as named in the feature spec).
export interface VoteRecord {
  voterId: string;
  vote: "up" | "down";
  votedAt: Timestamp | FieldValue;
}

// Learn Questions session (in-memory only, never persisted)
export interface LearnQuestionsSessionState {
  questions: LearnQuestion[];
  currentIndex: number;
  answers: Record<string, { selected: string; correct: boolean }>;
}

export interface LearnQuestion {
  id: string;
  type: "multiple_choice" | "true_false";
  question: string;
  options: string[];
  correctAnswer: string;
  sourceCourse: string; // display name
  sourceSet: string; // set name
  explanation?: string;
}
