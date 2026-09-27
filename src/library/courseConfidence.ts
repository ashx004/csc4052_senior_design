// A running estimate of how confident a student is in each course, for the
// AI to use across the app. Two inputs, kept separate so the AI can explain
// itself:
//   - evidence: every quiz attempt in the course, most recent weighted most
//     (the same recency weighting as the study plan's computeQuizMastery,
//     extended past three attempts, and shrunk toward "unknown" when there
//     are only one or two attempts - a single 10/10 isn't mastery);
//   - the student's own say: a 1-5 self-rating ("I've got 325 down") that
//     reassures the AI. It counts for more when it's newer than the quizzes.
// Pure functions only (no Firebase), so the chat route and the quiz page
// share the exact same maths.

export interface QuizAttemptSummary {
  quizName: string;
  score: number;
  total: number;
  /** ISO timestamp */
  completedAt: string;
  /** Questions in the whole quiz. A "retest missed" run covers fewer, and
   *  counts in proportion - a 0/1 retest shouldn't outweigh a 5/6 quiz. */
  quizLength?: number;
}

export interface SelfRating {
  /** 1 (lost) - 5 (very confident) */
  level: number;
  note?: string;
  /** ISO timestamp */
  setAt: string;
}

export interface CourseConfidence {
  /** 0-1, or null with no quiz attempts */
  quizEstimate: number | null;
  attemptCount: number;
  /** 0-1 from the self-rating, or null */
  selfEstimate: number | null;
  /** What the AI should go on: blend of the two, or whichever exists. */
  combined: number | null;
  label: "no data yet" | "struggling" | "developing" | "solid" | "strong";
  /** One line the AI can repeat as its reasoning. */
  basis: string;
}

const DECAY = 0.6; // each older attempt counts 60% of the one after it
const PRIOR_WEIGHT = 1.5; // pseudo-attempts at 50% - shrinks tiny samples

export function quizEstimate(attempts: QuizAttemptSummary[]): number | null {
  const valid = attempts.filter((a) => a.total > 0).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  if (valid.length === 0) return null;
  let weighted = 0.5 * PRIOR_WEIGHT;
  let weights = PRIOR_WEIGHT;
  valid.slice(0, 10).forEach((a, i) => {
    const coverage = a.quizLength && a.quizLength > a.total ? a.total / a.quizLength : 1;
    const w = Math.pow(DECAY, i) * coverage;
    weighted += w * Math.min(1, a.score / a.total);
    weights += w;
  });
  return weighted / weights;
}

export function selfEstimate(rating: SelfRating | null | undefined): number | null {
  if (!rating || !(rating.level >= 1 && rating.level <= 5)) return null;
  return (rating.level - 1) / 4;
}

export function labelFor(value: number | null): CourseConfidence["label"] {
  if (value === null) return "no data yet";
  if (value < 0.45) return "struggling";
  if (value < 0.65) return "developing";
  if (value < 0.82) return "solid";
  return "strong";
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function courseConfidence(attempts: QuizAttemptSummary[], rating?: SelfRating | null): CourseConfidence {
  const q = quizEstimate(attempts);
  const s = selfEstimate(rating);
  const latestQuiz = attempts.reduce((max, a) => (a.completedAt > max ? a.completedAt : max), "");
  const selfIsNewer = !!rating && rating.setAt > latestQuiz;

  let combined: number | null;
  let basis: string;
  if (q === null && s === null) {
    combined = null;
    basis = "No quiz attempts and no self-rating yet.";
  } else if (q === null) {
    combined = s;
    basis = `No quiz attempts yet - going on the student's own rating (${rating!.level}/5).`;
  } else if (s === null) {
    combined = q;
    basis = `Quiz-based estimate ${pct(q)} from ${attempts.length} quiz attempt${attempts.length === 1 ? "" : "s"}, recent ones counting most (a weighted estimate, not an average and not any quiz's score).`;
  } else {
    // A rating given after the latest quiz is the freshest information we
    // have, so it gets an equal say; an older one still nudges the estimate.
    const selfWeight = selfIsNewer ? 0.5 : 0.25;
    combined = q * (1 - selfWeight) + s * selfWeight;
    basis = `Quiz-based estimate ${pct(q)} (a weighted estimate, not any quiz's score) over ${attempts.length} attempt${attempts.length === 1 ? "" : "s"}; student's own rating: ${rating!.level}/5${selfIsNewer ? " (newer than their last quiz, so weighted equally)" : ""}.`;
  }
  return { quizEstimate: q, attemptCount: attempts.length, selfEstimate: s, combined, label: labelFor(combined), basis };
}
