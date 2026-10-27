import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  runTransaction,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type UpdateData,
} from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { getEffectiveModelKey } from "@/src/library/chatMode";
import { generationFailureMessage } from "@/src/hooks/usePracticeGeneration";
import { tagFocusedQuestions, type ConceptFocus } from "@/src/library/generation/conceptFocus";
import { DEFAULT_QUIZ_DIFFICULTY } from "@/src/library/quizDifficulty";
import {
  commitSuggestionTask,
  type SuggestionCourseInfo,
  type SuggestionTaskDraft,
} from "@/src/library/studyPlan/addSuggestionToPlan";
import { isUsableConceptLabel } from "@/src/library/studyPlan/conceptKey";
import {
  studyPlanPath,
  studyTasksCollection,
} from "@/src/library/studyPlan/firestorePaths";
import {
  buildTargetedPracticeRequest,
  TARGETED_PRACTICE_QUESTION_COUNT,
  TARGETED_PRACTICE_QUESTION_TYPES,
  targetedPracticeNameFromFocus,
} from "@/src/library/studyPlan/targetedPractice";
import type { ActivityTarget, ConceptWeakSpot } from "@/src/library/studyPlan/types";

export type ConceptPracticeType = Extract<ActivityTarget, { kind: "concept_practice" }>["practiceType"];

// MAX_FLASHCARDS in flashcardGeneration.ts. Importing it would pull the server
// generation code into this client bundle.
const MAX_FLASHCARDS = 30;

/** Each format's default size and its cap, so every concept can get its three items. */
export function practiceCounts(type: ConceptPracticeType): { requested: number; max: number } {
  switch (type) {
    case "quiz":
      return { requested: TARGETED_PRACTICE_QUESTION_COUNT, max: TARGETED_PRACTICE_QUESTION_COUNT };
    case "flashcards":
      return { requested: 10, max: MAX_FLASHCARDS };
    case "drag_drop":
      return { requested: 6, max: 8 };
    default:
      return { requested: 6, max: 12 };
  }
}

export function documentUrl(sourceDocKey: string): string {
  return `/api/download?key=${encodeURIComponent(sourceDocKey)}`;
}

export function documentName(sourceDocKey: string): string {
  return sourceDocKey.split("/").pop()?.replace(/^\d+[-_]/, "") || "document";
}

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(generationFailureMessage(response.status, data.error));
  return data;
}

/** Every question text in the course's quiz sets made from any of these documents. */
export async function askedQuestionTexts(
  uid: string,
  courseId: string,
  sourceDocKeys: readonly string[],
): Promise<string[]> {
  if (sourceDocKeys.length === 0) return [];
  const keys = new Set(sourceDocKeys);
  const snap = await getDocs(collection(db, "users", uid, "enrollment", courseId, "quizSets"));
  const texts: string[] = [];
  for (const quizSet of snap.docs) {
    const data = quizSet.data();
    if (typeof data.sourceDocKey !== "string" || !keys.has(data.sourceDocKey)) continue;
    if (!Array.isArray(data.questions)) continue;
    for (const question of data.questions as unknown[]) {
      const text = question && typeof question === "object" ? (question as Record<string, unknown>).question : null;
      if (typeof text === "string" && text.trim()) texts.push(text);
    }
  }
  return texts;
}

/** A focused quiz, saved as a new quiz set. Resolves with the set's id. */
export async function generateConceptQuiz(input: {
  uid: string;
  courseId: string;
  sourceDocKey: string;
  focus: ConceptFocus;
}): Promise<string> {
  const data = await postJson(
    "/api/generate-quiz",
    buildTargetedPracticeRequest({
      sourceDocKey: input.sourceDocKey,
      focus: input.focus,
      avoidQuestions: input.focus.avoid,
      modelKey: getEffectiveModelKey("quiz"),
    }),
  );
  const questions = tagFocusedQuestions(Array.isArray(data.questions) ? data.questions : [], input.focus);
  const created = await addDoc(collection(db, "users", input.uid, "enrollment", input.courseId, "quizSets"), {
    name: targetedPracticeNameFromFocus(input.focus),
    sourceDocKey: input.sourceDocKey,
    questions,
    questionTypes: TARGETED_PRACTICE_QUESTION_TYPES,
    difficulty: DEFAULT_QUIZ_DIFFICULTY,
    questionCount: questions.length,
    pinned: true,
    visibility: "private",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return created.id;
}

/** A focused flashcard set, saved as a new set. Resolves with the set's id. */
export async function generateConceptFlashcards(input: {
  uid: string;
  courseId: string;
  sourceDocKey: string;
  focus: ConceptFocus;
  count: number;
}): Promise<string> {
  const data = await postJson("/api/generate-flashcards", {
    docUrl: documentUrl(input.sourceDocKey),
    docName: documentName(input.sourceDocKey),
    courseId: input.courseId,
    count: input.count,
    modelKey: getEffectiveModelKey("flashcards"),
    focus: input.focus,
  });
  const cards = Array.isArray(data.questions) ? data.questions : [];
  const created = await addDoc(collection(db, "users", input.uid, "enrollment", input.courseId, "flashcardSets"), {
    name: targetedPracticeNameFromFocus(input.focus),
    sourceDocKey: input.sourceDocKey,
    sourceKeys: [input.sourceDocKey],
    cards,
    visibility: "private",
    pinned: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return created.id;
}

/** Asks the naming route for the concept behind each question. Unusable labels are left out. */
export async function nameMissedConcepts(
  questions: readonly { id: string; question: string; correctAnswer: string }[],
  existing: readonly Pick<ConceptWeakSpot, "conceptKey" | "label">[],
): Promise<Record<string, string>> {
  const response = await fetch("/api/name-concepts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      questions: questions.map((q) => ({ questionId: q.id, question: q.question, correctAnswer: q.correctAnswer })),
      existingConcepts: existing.map((spot) => ({ conceptKey: spot.conceptKey, label: spot.label })),
    }),
  });
  if (!response.ok) throw new Error(`Naming concepts failed (${response.status}).`);
  const data = (await response.json().catch(() => null)) as { concepts?: unknown } | null;
  const labels: Record<string, string> = {};
  for (const item of Array.isArray(data?.concepts) ? data.concepts : []) {
    if (!item || typeof item !== "object") continue;
    const { questionId, label } = item as Record<string, unknown>;
    if (typeof questionId !== "string" || typeof label !== "string") continue;
    if (isUsableConceptLabel(label)) labels[questionId] = label.trim();
  }
  return labels;
}

/**
 * Writes returned labels onto the stored questions' concept field, so the same
 * question is never sent for naming again. A question already tagged keeps its tag.
 */
export async function saveConceptLabels(
  uid: string,
  courseId: string,
  quizId: string,
  labels: Record<string, string>,
): Promise<void> {
  if (Object.keys(labels).length === 0) return;
  const quizRef = doc(db, "users", uid, "enrollment", courseId, "quizSets", quizId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(quizRef);
    if (!snap.exists()) return;
    const questions: unknown = snap.data().questions;
    if (!Array.isArray(questions)) return;
    let changed = false;
    const next = questions.map((question: unknown) => {
      if (!question || typeof question !== "object") return question;
      const record = question as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : null;
      const tagged = typeof record.concept === "string" && record.concept.trim() !== "";
      if (!id || tagged || !labels[id]) return question;
      changed = true;
      return { ...record, concept: labels[id] };
    });
    if (changed) transaction.update(quizRef, { questions: next, updatedAt: serverTimestamp() });
  });
}

/**
 * Saves one study task from a draft. `existingTaskId` makes a repeat call
 * return the first task instead of writing a second one.
 */
export async function commitStudyTask(input: {
  uid: string;
  courseId: string;
  /** Names the learning-suggestion document commitSuggestionTask checks; none is written. */
  suggestionKey: string;
  course: SuggestionCourseInfo;
  planDate: string;
  draft: SuggestionTaskDraft;
  existingTaskId: string | null;
}): Promise<string | null> {
  const taskId = await runTransaction(db, async (transaction) =>
    commitSuggestionTask(
      {
        async get(path) {
          const snap = await transaction.get(doc(db, path));
          return {
            exists: snap.exists(),
            data: () => (snap.exists() ? (snap.data() as Record<string, unknown>) : undefined),
          };
        },
        set(path, data) {
          transaction.set(doc(db, path), data as DocumentData);
        },
        update(path, data) {
          transaction.update(doc(db, path), data as UpdateData<DocumentData>);
        },
        createId() {
          return doc(collection(db, studyTasksCollection(input.uid))).id;
        },
        serverTimestamp() {
          return serverTimestamp();
        },
      },
      {
        uid: input.uid,
        suggestion: {
          id: input.suggestionKey,
          type: "missed_questions",
          courseId: input.courseId,
          sourceDocKey: null,
          quizId: input.suggestionKey,
          questionIds: [],
          questionFailureCounts: {},
          status: "active",
          priority: 0,
          linkedTaskId: null,
          sourceAttemptId: "",
        },
        planDate: input.planDate,
        course: input.course,
        existingTaskId: input.existingTaskId,
        draft: input.draft,
      },
    ),
  );
  if (taskId && taskId !== input.existingTaskId) await addTaskToTodaysPlan(input.uid, input.planDate, taskId);
  return taskId;
}

/** Best effort: today's plan document, when there is one, lists the new task. */
async function addTaskToTodaysPlan(uid: string, planDate: string, taskId: string): Promise<void> {
  try {
    const planRef = doc(db, studyPlanPath(uid, planDate));
    const snap = await getDoc(planRef);
    if (!snap.exists()) return;
    const taskIds: unknown = snap.data().taskIds;
    if (Array.isArray(taskIds) && taskIds.includes(taskId)) return;
    await updateDoc(planRef, { taskIds: arrayUnion(taskId), totalTasks: increment(1), updatedAt: serverTimestamp() });
  } catch (error) {
    console.error("Adding the task to today's plan failed:", error);
  }
}

export function todayPlanDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
