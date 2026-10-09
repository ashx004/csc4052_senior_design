import type { Blank, ItemResult, WordProblemItem } from "./types";

// Marking typed answers. Everything here is deterministic and runs in the
// browser, so fill-in-the-blank and numeric word problems are graded
// instantly; only written word-problem answers need the AI (see
// /api/grade-practice).

/** Lowercase, no accents or punctuation, no leading article, single spaces. */
export function normalizeAnswer(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[“”"'‘’`]/g, "")
    .replace(/[^a-z0-9.+\-/%$^ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "")
    .replace(/[.]+$/, "")
    .trim();
}

/**
 * Edit distance where swapping two neighbouring letters counts as one slip
 * ("cristea" is one typo away from "cristae"), the commonest way to mistype.
 * Gives up early once it is certain to exceed `limit`.
 */
function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let beforePrevious: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        current[j] = Math.min(current[j], beforePrevious[j - 2] + 1);
      }
      if (current[j] < rowMin) rowMin = current[j];
    }
    if (rowMin > limit) return limit + 1;
    beforePrevious = previous;
    previous = current;
  }
  return previous[b.length];
}

/** A near-miss spelling: one slip in a longer word, two in a long phrase. Never for numbers or short words. */
export function isTypo(typed: string, target: string): boolean {
  if (/\d/.test(target) || target.length < 5) return false;
  const allowed = target.length >= 12 ? 2 : 1;
  return editDistance(typed, target, allowed) <= allowed;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
};

/**
 * The first number in a piece of text, as a number: "1,250", "$3.50", "3/4",
 * "1 1/2", "2.5e3", "four" all work. `percent` says whether it had a % sign.
 */
export function parseNumber(text: string): { value: number; percent: boolean } | null {
  const clean = text.replace(/−/g, "-").replace(/(\d),(?=\d{3}\b)/g, "$1").trim();
  const mixed = clean.match(/(-?\d+)\s+(\d+)\s*\/\s*(\d+)/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const frac = Number(mixed[2]) / Number(mixed[3]);
    if (Number.isFinite(frac)) return { value: whole + Math.sign(whole || 1) * frac, percent: false };
  }
  const fraction = clean.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (fraction && Number(fraction[2]) !== 0) return { value: Number(fraction[1]) / Number(fraction[2]), percent: false };
  const sci = clean.match(/(-?\d+(?:\.\d+)?)\s*(?:e|x\s*10\^?|×\s*10\^?)\s*(-?\d+)/i);
  if (sci) return { value: Number(sci[1]) * 10 ** Number(sci[2]), percent: false };
  const plain = clean.match(/-?\d*\.?\d+/);
  if (plain) {
    const index = plain.index ?? 0;
    return { value: Number(plain[0]), percent: clean.slice(index + plain[0].length).trimStart().startsWith("%") };
  }
  const word = clean.toLowerCase().match(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|hundred)\b/);
  if (word) return { value: NUMBER_WORDS[word[1]], percent: false };
  return null;
}

const NUMERIC_ANSWER = /^[\s$€£]*-?[\d.,]+\s*%?\s*$|^\s*-?\d+\s*\/\s*\d+\s*$/;

export interface BlankGrade {
  correct: boolean;
  /** Right, but spelled slightly off. */
  typo: boolean;
}

export function gradeBlank(input: string, blank: Blank): BlankGrade {
  const typed = normalizeAnswer(input);
  if (!typed) return { correct: false, typo: false };
  const accepted = [blank.answer, ...blank.alternatives].map(normalizeAnswer).filter(Boolean);
  if (accepted.includes(typed)) return { correct: true, typo: false };

  // Numbers: "1,000" = "1000", "0.5" = "1/2".
  if (NUMERIC_ANSWER.test(blank.answer)) {
    const target = parseNumber(blank.answer);
    const got = NUMERIC_ANSWER.test(input) ? parseNumber(input) : null;
    if (target && got && closeEnough(got.value, target.value, 1e-9)) return { correct: true, typo: false };
    return { correct: false, typo: false };
  }
  if (accepted.some((answer) => isTypo(typed, answer))) return { correct: true, typo: true };
  return { correct: false, typo: false };
}

/** Fraction of a question's blanks answered correctly. */
export function gradeFillBlank(inputs: string[], blanks: Blank[]): { score: number; perBlank: BlankGrade[] } {
  const perBlank = blanks.map((blank, i) => gradeBlank(inputs[i] ?? "", blank));
  const correct = perBlank.filter((g) => g.correct).length;
  return { score: blanks.length ? correct / blanks.length : 0, perBlank };
}

function closeEnough(value: number, expected: number, tolerance: number): boolean {
  if (expected === 0) return Math.abs(value) <= Math.max(tolerance, 1e-9);
  return Math.abs(value - expected) <= Math.abs(expected) * tolerance;
}

export interface NumericGrade {
  correct: boolean;
  /** What the student's answer was read as, if it contained a number. */
  read: number | null;
}

/** Marks a numeric word-problem answer; units and thousands separators are ignored. */
export function gradeNumeric(input: string, item: Pick<WordProblemItem, "expectedAnswer" | "tolerance">): NumericGrade {
  const expected = parseNumber(item.expectedAnswer);
  const got = parseNumber(input);
  if (!expected || !got) return { correct: false, read: got?.value ?? null };
  const tolerance = item.tolerance ?? 0.01;
  // "25%" for an expected 0.25 (or "0.25" for an expected 25%) is the same answer.
  const candidates = [got.value, ...(got.percent ? [got.value / 100] : []), ...(expected.percent ? [got.value * 100] : [])];
  return { correct: candidates.some((c) => closeEnough(c, expected.value, tolerance)), read: got.value };
}

/** Totals a run: points earned out of the number of questions. */
export function totalScore(results: ItemResult[]): { score: number; total: number; percent: number } {
  const score = results.reduce((sum, r) => sum + r.score, 0);
  const total = results.length;
  return { score: Math.round(score * 100) / 100, total, percent: total ? Math.round((score / total) * 100) : 0 };
}
