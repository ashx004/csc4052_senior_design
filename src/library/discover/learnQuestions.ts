
// Updated version that calls the Ollama API route when not enough
// existing questions are available to fill a 10-question session.

import {
  collection,
  getDocs,
} from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { getEnrollmentStatus } from "@/src/library/enrollmentStatus";
import type { LearnQuestion } from "./types";

/**
 * Build a Learn Questions session:
 * 1. Read all quiz sets across active enrollments
 * 2. Collect MC/TF questions, tag with source course
 * 3. Shuffle and balance across courses
 * 4. If fewer than 10, call the API route to generate the rest
 * 5. Return up to 10 questions total
 */
export async function buildLearnQuestionsSession(
  uid: string
): Promise<LearnQuestion[]> {
  const TARGET = 10;

  // 1. Get active enrollments
  const enrollSnap = await getDocs(
    collection(db, "users", uid, "enrollment")
  );

  type CourseInfo = {
    courseId: string;
    classCode: string;
    className: string;
  };

  const activeCourses: CourseInfo[] = [];

  enrollSnap.forEach((doc) => {
    const data = doc.data();
    const status = getEnrollmentStatus(data);
    if (status === "in-progress" || status === "planned") {
      activeCourses.push({
        courseId: doc.id,
        classCode: data.classCode || "",
        className: data.className || data.classCode || "Unknown Course",
      });
    }
  });

  if (activeCourses.length === 0) return [];

  // 2. Collect existing MC/TF questions from all quiz sets
  const allQuestions: LearnQuestion[] = [];
  const courseTopics: Map<string, string[]> = new Map(); // for AI context

  for (const course of activeCourses) {
    const quizSnap = await getDocs(
      collection(
        db,
        "users",
        uid,
        "enrollment",
        course.courseId,
        "quizSets"
      )
    );

    const topics: string[] = [];

    quizSnap.forEach((qDoc) => {
      const set = qDoc.data();
      const setName = set.name || "Untitled";
      topics.push(setName);

      const questions = set.questions || [];
      for (const q of questions) {
        if (q.type !== "multiple_choice" && q.type !== "true_false") continue;
        if (!q.question || !q.correctAnswer || !q.options?.length) continue;

        allQuestions.push({
          id: q.id || `existing-${allQuestions.length}`,
          type: q.type,
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          sourceCourse: `${course.classCode} — ${course.className}`,
          sourceSet: setName,
          explanation: q.explanation || "",
        });
      }
    });

    courseTopics.set(course.courseId, topics);
  }

  // 3. Shuffle and balance across courses
  const shuffled = balanceAndShuffle(allQuestions, activeCourses.length);
  const existing = shuffled.slice(0, TARGET);

  // 4. If we have enough, return
  if (existing.length >= TARGET) {
    return existing;
  }

  // 5. Not enough — try to generate the missing ones via Ollama
  const missing = TARGET - existing.length;

  try {
    const generated = await generateMissingQuestions(
      activeCourses,
      courseTopics,
      missing
    );

    // Merge: existing first, then generated, shuffle everything
    const combined = [...existing, ...generated];
    return shuffleArray(combined).slice(0, TARGET);
  } catch (err) {
    console.error("AI question generation failed, using existing only:", err);
    // Graceful fallback — return whatever existing questions we have
    return existing;
  }
}

/**
 * Call the /api/discover/learn-questions route to generate questions via Ollama.
 */
async function generateMissingQuestions(
  courses: { courseId: string; classCode: string; className: string }[],
  courseTopics: Map<string, string[]>,
  count: number
): Promise<LearnQuestion[]> {
  const body = {
    courses: courses.map((c) => ({
      courseCode: c.classCode,
      courseName: c.className,
      existingTopics: courseTopics.get(c.courseId) || [],
    })),
    count,
  };

  const res = await fetch("/api/discover/learn-questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`API returned ${res.status}`);
  }

  const data = await res.json();
  const questions: LearnQuestion[] = (data.questions || []).map(
    (q: any, i: number) => ({
      id: q.id || `gen-${Date.now()}-${i}`,
      type: q.type,
      question: q.question,
      options: q.options,
      correctAnswer: q.correctAnswer,
      sourceCourse: "AI Generated",
      sourceSet: "Learn Questions",
      explanation: q.explanation || "",
    })
  );

  return questions;
}

/**
 * Balance questions across courses, then shuffle.
 * Takes roughly equal numbers from each course.
 */
function balanceAndShuffle(
  questions: LearnQuestion[],
  courseCount: number
): LearnQuestion[] {
  if (questions.length === 0 || courseCount === 0) return [];

  // Group by source course
  const byCourse = new Map<string, LearnQuestion[]>();
  for (const q of questions) {
    const existing = byCourse.get(q.sourceCourse) || [];
    existing.push(q);
    byCourse.set(q.sourceCourse, existing);
  }

  // Shuffle within each course group
  for (const [key, group] of byCourse) {
    byCourse.set(key, shuffleArray(group));
  }

  // Round-robin pick from each course
  const result: LearnQuestion[] = [];
  const iterators = Array.from(byCourse.values()).map((group) => ({
    items: group,
    index: 0,
  }));

  let added = true;
  while (added) {
    added = false;
    for (const iter of iterators) {
      if (iter.index < iter.items.length) {
        result.push(iter.items[iter.index]);
        iter.index++;
        added = true;
      }
    }
  }

  return result;
}

/** Fisher-Yates shuffle */
function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}