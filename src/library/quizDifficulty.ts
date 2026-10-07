// Quiz levels (Story 2). Each level is a Bloom's-taxonomy mix, and
// buildBloomPlan turns it into one target level per question so the quiz
// prompt can name the level of every question - per-question levels beat
// "make a mix" (see the Story 2 spec's research section). Pure and
// client-safe: QuizSetupModal imports the labels from here too.

export const QUIZ_DIFFICULTIES = ["review", "exam", "challenge"] as const;
export type QuizDifficulty = (typeof QUIZ_DIFFICULTIES)[number];
export const DEFAULT_QUIZ_DIFFICULTY: QuizDifficulty = "exam";

export const BLOOM_LEVELS = ["remember", "understand", "apply", "analyze", "evaluate"] as const;
export type BloomLevel = (typeof BLOOM_LEVELS)[number];

export const QUIZ_DIFFICULTY_OPTIONS: readonly { value: QuizDifficulty; label: string; subtitle: string }[] = [
  { value: "review", label: "Review", subtitle: "Check key facts and ideas" },
  { value: "exam", label: "Exam-style", subtitle: "Like a real class exam" },
  { value: "challenge", label: "Challenge", subtitle: "Apply and analyze in new situations" },
];

// Percent of questions per Bloom level; each row adds up to 100.
const BLOOM_MIX: Record<QuizDifficulty, Partial<Record<BloomLevel, number>>> = {
  review: { remember: 40, understand: 40, apply: 20 },
  exam: { remember: 20, understand: 30, apply: 35, analyze: 15 },
  challenge: { understand: 10, apply: 40, analyze: 35, evaluate: 15 },
};

function isQuizDifficulty(value: unknown): value is QuizDifficulty {
  return typeof value === "string" && (QUIZ_DIFFICULTIES as readonly string[]).includes(value);
}

/** Request input → level. Anything missing or unknown is Exam-style. */
export function parseQuizDifficulty(value: unknown): QuizDifficulty {
  return isQuizDifficulty(value) ? value : DEFAULT_QUIZ_DIFFICULTY;
}

/** A saved quiz's level, or null for quizzes made before levels existed. */
export function storedQuizDifficulty(value: unknown): QuizDifficulty | null {
  return isQuizDifficulty(value) ? value : null;
}

export function difficultyLabel(difficulty: QuizDifficulty): string {
  return QUIZ_DIFFICULTY_OPTIONS.find((option) => option.value === difficulty)?.label ?? difficulty;
}

/**
 * One target Bloom level per question, easiest first. Largest-remainder
 * rounding keeps the total equal to questionCount; ties go to the level
 * listed first (Array.prototype.sort is stable).
 */
export function buildBloomPlan(difficulty: QuizDifficulty, questionCount: number): BloomLevel[] {
  const mix = BLOOM_LEVELS.filter((level) => BLOOM_MIX[difficulty][level]).map((level) => {
    const exact = ((BLOOM_MIX[difficulty][level] ?? 0) * questionCount) / 100;
    return { level, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let missing = questionCount - mix.reduce((sum, entry) => sum + entry.count, 0);
  for (const entry of [...mix].sort((a, b) => b.remainder - a.remainder)) {
    if (missing <= 0) break;
    entry.count++;
    missing--;
  }
  return mix.flatMap((entry) => Array<BloomLevel>(entry.count).fill(entry.level));
}
