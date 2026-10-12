// The three kinds of generated practice, beyond multiple-choice quizzes:
//   fill_blank    sentences with blanks to type into
//   word_problem  applied problems answered in a text box (numbers are checked
//                 automatically, written answers are graded by the AI)
//   drag_drop     click-and-drag tiles into place against a timer
// A "practice set" is one generated batch of a single kind, saved under the
// course at users/{uid}/enrollment/{courseId}/practiceSets/{setId}, with each
// finished run in its `attempts` subcollection.

export type PracticeKind = "fill_blank" | "word_problem" | "drag_drop";

export const PRACTICE_KINDS: PracticeKind[] = ["fill_blank", "word_problem", "drag_drop"];

// Same three levels (and names) as the quiz levels in quizDifficulty.ts on the sprint-5 quiz branch,
// so practice and quizzes can share one vocabulary once that branch is merged.
export type PracticeDifficulty = "review" | "exam" | "challenge";

export const BLANK_MARKER = "____";

/** Longest written word-problem answer accepted. */
export const MAX_WRITTEN_ANSWER_CHARS = 1200;

export interface Blank {
  /** The accepted answer, as it appears in the source. */
  answer: string;
  /** Other accepted ways to write it. */
  alternatives: string[];
  hint?: string;
}

export interface FillBlankItem {
  id: string;
  kind: "fill_blank";
  /** The sentence(s), with each blank written as ____ in the order of `blanks`. */
  text: string;
  blanks: Blank[];
  explanation: string;
}

export interface WordProblemItem {
  id: string;
  kind: "word_problem";
  problem: string;
  /** "number": checked automatically. "text": a written answer graded by the AI. */
  answerType: "number" | "text";
  /** A number for "number" problems; a model answer for "text" ones. */
  expectedAnswer: string;
  unit?: string;
  /** Allowed relative error for numbers (0.01 = 1%). */
  tolerance?: number;
  /** For "text" problems: the ideas a good answer includes. */
  keyPoints: string[];
  /** The worked solution, shown after answering. */
  solution: string;
}

export type DragDropMode = "match" | "categorize" | "sequence";

export interface DragTile {
  id: string;
  label: string;
}

export interface DropZone {
  id: string;
  label: string;
}

export interface DragDropItem {
  id: string;
  kind: "drag_drop";
  mode: DragDropMode;
  instructions: string;
  tiles: DragTile[];
  zones: DropZone[];
  /** tile id -> the zone it belongs in. */
  solution: Record<string, string>;
  /** Time allowed for this round. */
  timeLimitSeconds: number;
  explanation: string;
}

export type PracticeItem = FillBlankItem | WordProblemItem | DragDropItem;

export interface PracticeSetDoc {
  name: string;
  kind: PracticeKind;
  items: PracticeItem[];
  sourceDocKey: string;
  sourceName: string;
  difficulty: PracticeDifficulty;
  pinned?: boolean;
}

/** How one question went, saved with an attempt. */
export interface ItemResult {
  itemId: string;
  /** 0 to 1: the fraction of the question answered correctly. */
  score: number;
  /** What the student entered, in a form that can be shown again. */
  response: unknown;
  /** Seconds spent (drag-and-drop rounds). */
  seconds?: number;
}

export interface PracticeAttempt {
  id: string;
  /** Sum of item scores. */
  score: number;
  total: number;
  durationMs: number;
  results: ItemResult[];
}

export const KIND_LABELS: Record<PracticeKind, { title: string; short: string; description: string }> = {
  fill_blank: {
    title: "Fill in the blank",
    short: "Fill in the blank",
    description: "Type the missing key terms in sentences taken from your notes.",
  },
  word_problem: {
    title: "Word problems",
    short: "Word problems",
    description: "Apply what you learned to a situation and write out your answer.",
  },
  drag_drop: {
    title: "Drag and drop",
    short: "Drag & drop",
    description: "Race the clock: drag terms to their matches, sort them, or put steps in order.",
  },
};

export const DIFFICULTY_LABELS: Record<PracticeDifficulty, string> = {
  review: "Review",
  exam: "Exam-style",
  challenge: "Challenge",
};
