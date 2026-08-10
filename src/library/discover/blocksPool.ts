import { collection, getDocs } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { getEnrollmentStatus } from "@/src/library/enrollmentStatus";
import { POOL_TOPUP_THRESHOLD } from "./blocksTypes";
import type {
  BlocksMatchingPair,
  BlocksMatchingQuestion,
  BlocksQuestion,
  BlocksSingleQuestion,
} from "./blocksTypes";

interface RawQuizQuestion {
  id?: string;
  type?: string;
  question?: string;
  options?: string[];
  correctAnswer?: string;
  explanation?: string;
  matchingGroupId?: string;
}

interface RawFlashcard {
  question: string;
  answer: string;
}

export function extractSingleQuestions(
  questions: RawQuizQuestion[],
  sourceCourse: string,
  sourceSet: string
): BlocksSingleQuestion[] {
  const result: BlocksSingleQuestion[] = [];
  questions.forEach((q, index) => {
    if (q.type !== "multiple_choice" && q.type !== "true_false") return;
    if (!q.question || !q.correctAnswer || !q.options?.length) return;
    result.push({
      id: `single-${sourceSet}-${q.id ?? index}`,
      kind: "single",
      type: q.type,
      question: q.question,
      options: q.options,
      correctAnswer: q.correctAnswer,
      sourceCourse,
      sourceSet,
      explanation: q.explanation || "",
    });
  });
  return result;
}

export function extractMatchingQuestions(
  questions: RawQuizQuestion[],
  sourceCourse: string,
  sourceSet: string
): BlocksMatchingQuestion[] {
  const groups = new Map<string, RawQuizQuestion[]>();
  for (const q of questions) {
    if (q.type !== "matching" || !q.matchingGroupId) continue;
    if (!q.question || !q.correctAnswer) continue;
    const group = groups.get(q.matchingGroupId) ?? [];
    group.push(q);
    groups.set(q.matchingGroupId, group);
  }

  const result: BlocksMatchingQuestion[] = [];
  for (const [groupId, group] of groups) {
    if (group.length < 3) continue;
    const pairs: BlocksMatchingPair[] = group.map((q, index) => ({
      id: q.id ?? `${groupId}-${index}`,
      term: q.question as string,
      definition: q.correctAnswer as string,
    }));
    result.push({ id: `matching-${sourceSet}-${groupId}`, kind: "matching", sourceCourse, sourceSet, pairs });
  }
  return result;
}

export function sampleFlashcardsAsMatching(
  cards: RawFlashcard[],
  sourceCourse: string,
  sourceSet: string,
  rng: () => number = Math.random
): BlocksMatchingQuestion | null {
  if (cards.length < 3) return null;

  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const uniqueCards: RawFlashcard[] = [];
  const selectedAnswers = new Set<string>();
  for (const card of shuffled) {
    const normalizedAnswer = card.answer.trim();
    if (selectedAnswers.has(normalizedAnswer)) continue;
    selectedAnswers.add(normalizedAnswer);
    uniqueCards.push(card);
    if (uniqueCards.length === 5) break;
  }
  if (uniqueCards.length < 3) return null;

  const maxSample = uniqueCards.length;
  const minSample = Math.min(3, maxSample);
  const count = minSample + Math.floor(rng() * (maxSample - minSample + 1));
  const sample = uniqueCards.slice(0, count);

  const pairs: BlocksMatchingPair[] = sample.map((card, index) => ({
    id: `${sourceSet}-flashcard-${index}`,
    term: card.question,
    definition: card.answer,
  }));

  return { id: `matching-flashcards-${sourceSet}`, kind: "matching", sourceCourse, sourceSet, pairs };
}

export function needsTopUp(
  pool: BlocksQuestion[],
  servedIds: Set<string>,
  threshold: number = POOL_TOPUP_THRESHOLD
): boolean {
  const unserved = pool.filter((q) => !servedIds.has(q.id)).length;
  return unserved < threshold;
}

export function pickNextQuestion(
  pool: BlocksQuestion[],
  servedIds: Set<string>,
  rng: () => number = Math.random
): BlocksQuestion | null {
  const unserved = pool.filter((q) => !servedIds.has(q.id));
  if (unserved.length === 0) return null;
  return unserved[Math.floor(rng() * unserved.length)];
}

interface ActiveCourse {
  courseId: string;
  classCode: string;
  className: string;
}

async function getActiveCourses(uid: string): Promise<ActiveCourse[]> {
  const enrollSnap = await getDocs(collection(db, "users", uid, "enrollment"));
  const courses: ActiveCourse[] = [];
  enrollSnap.forEach((docSnap) => {
    const data = docSnap.data();
    const status = getEnrollmentStatus(data);
    if (status === "in-progress" || status === "planned") {
      courses.push({
        courseId: docSnap.id,
        classCode: data.classCode || "",
        className: data.className || data.classCode || "Unknown Course",
      });
    }
  });
  return courses;
}

async function generateAIQuestions(
  courses: ActiveCourse[],
  count: number,
  cardsByCourse?: Map<string, RawFlashcard[]>
): Promise<BlocksSingleQuestion[]> {
  const body = {
    courses: courses.map((c) => ({
      courseCode: c.classCode,
      courseName: c.className,
      existingTopics: [] as string[],
      cardsToTest: cardsByCourse?.get(c.courseId),
    })),
    count,
  };

  const res = await fetch("/api/discover/learn-question", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // Soft-fail: AI top-up is optional. The route returns 502 with
  // `{ questions: [] }` when Ollama is down — never throw into the game UI.
  if (!res.ok) {
    console.warn(`Blocks: AI question generation returned ${res.status}; continuing without generated questions.`);
    return [];
  }

  const data = await res.json();
  const questions: { id?: string; type: "multiple_choice" | "true_false"; question: string; options: string[]; correctAnswer: string; explanation?: string }[] =
    data.questions || [];

  return questions.map((q, i) => ({
    id: `gen-${Date.now()}-${i}`,
    kind: "single" as const,
    type: q.type,
    question: q.question,
    options: q.options,
    correctAnswer: q.correctAnswer,
    sourceCourse: "AI Generated",
    sourceSet: "Blocks",
    explanation: q.explanation || "",
  }));
}

/** Builds the initial cross-course question pool for a Blocks game (spec §3). */
export async function buildBlocksPool(uid: string): Promise<BlocksQuestion[]> {
  const activeCourses = await getActiveCourses(uid);
  if (activeCourses.length === 0) return [];

  const pool: BlocksQuestion[] = [];
  const aiJobs: Array<() => Promise<BlocksSingleQuestion[]>> = [];

  for (const course of activeCourses) {
    const sourceCourse = `${course.classCode} — ${course.className}`;

    const quizSnap = await getDocs(collection(db, "users", uid, "enrollment", course.courseId, "quizSets"));
    quizSnap.forEach((qDoc) => {
      const set = qDoc.data();
      const setName = set.name || "Untitled";
      const questions: RawQuizQuestion[] = set.questions || [];
      pool.push(...extractSingleQuestions(questions, sourceCourse, setName));
      pool.push(...extractMatchingQuestions(questions, sourceCourse, setName));
    });

    const flashcardSnap = await getDocs(
      collection(db, "users", uid, "enrollment", course.courseId, "flashcardSets")
    );
    for (const fDoc of flashcardSnap.docs) {
      const set = fDoc.data();
      const setName = set.name || "Untitled";
      const cards: RawFlashcard[] = set.cards || [];
      if (cards.length < 3) continue;

      const matching = sampleFlashcardsAsMatching(cards, sourceCourse, setName);
      if (matching) pool.push(matching);

      if (aiJobs.length < 3) {
        aiJobs.push(async () => {
          try {
            const generated = await generateAIQuestions(
              [course],
              3,
              new Map([[course.courseId, cards.slice(0, 10)]])
            );
            return generated.map((q) => ({ ...q, sourceCourse, sourceSet: setName }));
          } catch (err) {
            console.error(`Blocks: flashcard question generation failed for "${setName}":`, err);
            return [];
          }
        });
      }
    }
  }

  const generatedResults = await Promise.allSettled(aiJobs.map((job) => job()));
  for (const result of generatedResults) {
    if (result.status === "fulfilled") pool.push(...result.value);
  }

  return pool;
}

/** Tops up a running pool when it's getting low on unserved questions (spec §3.3). */
export async function topUpPool(pool: BlocksQuestion[], uid: string): Promise<BlocksQuestion[]> {
  try {
    const activeCourses = await getActiveCourses(uid);
    if (activeCourses.length === 0) return pool;

    const generated = await generateAIQuestions(activeCourses, 5);
    const existingIds = new Set(pool.map((q) => q.id));
    const fresh = generated.filter((q) => !existingIds.has(q.id));
    return [...pool, ...fresh];
  } catch (err) {
    console.error("Blocks: pool top-up failed, continuing with the existing pool:", err);
    return pool;
  }
}
