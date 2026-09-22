// Cross-checks LLM-extracted transcript rows against the credit totals the
// transcript itself prints ("Current <attempted> <earned> <quality> ..." under each term). If a course
// row was dropped or misread, that term's credits will not add up.
//
// IMPORTANT: run this on the RAW pdf text (before cleanTranscriptTextForOllama),
// because the cleanup step deliberately strips the "Current ..." lines.

type CheckCourse = {
  term: string | null;
  creditHours: number | null;
  status: string;
};

export const CREDIT_MISMATCH_MARKER = "TRANSCRIPT_CREDIT_MISMATCH";

const SEASON_YEAR = /\b(Fall|Winter|Spring|Summer)\b.*?\b(20\d{2})\b/i;

function termKey(season: string, year: string): string {
  return `${season[0].toUpperCase()}${season.slice(1).toLowerCase()} ${year}`;
}

// Term header looks like: "Fall 2023 (09/01/2023-11/22/2023)" or
// "Summer - 12 wk 2024 (05/26/2024-08/31/2024)". The first "Current" line after
// it holds that term's attempted hours. In the PDF that summary table sits
// BESIDE the course table, so after text extraction "Current 10.00 ..." usually
// lands at the END of the first course row's line, not at the start of a line.
export type PrintedHours = { attempted: number; earned: number; quality: number };

export function readPrintedTermHours(rawText: string): Map<string, PrintedHours> {
  const printed = new Map<string, PrintedHours>();
  let currentTerm: string | null = null;

  for (const line of rawText.split(/\r?\n/)) {
    const header = line.match(
      /^\s*(Fall|Winter|Spring|Summer)\b.*?\b(20\d{2})\b.*\(\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}\)/i
    );
    if (header) {
      currentTerm = termKey(header[1], header[2]);
      continue;
    }

    const current = line.match(/\bCurrent\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/);
    if (current && currentTerm) {
      printed.set(currentTerm, { attempted: Number(current[1]), earned: Number(current[2]), quality: Number(current[3]) });
      currentTerm = null;
    }
  }

  return printed;
}

export function findTermCreditMismatches(rawText: string, courses: CheckCourse[]): string[] {
  const printed = readPrintedTermHours(rawText);
  const extracted = new Map<string, number>();

  for (const course of courses) {
    if (course.status === "transfer" || !course.term) continue;
    const match = course.term.match(SEASON_YEAR);
    if (!match) continue;
    const key = termKey(match[1], match[2]);
    extracted.set(key, (extracted.get(key) ?? 0) + (course.creditHours ?? 0));
  }

  const warnings: string[] = [];
  for (const [term, hours] of printed) {
    const extractedHours = extracted.get(term) ?? 0;

    // Which printed figure a row's credit column adds up to depends on the
    // grades: normal grades match all three; W / S rows show 0.00 in the row
    // but still count as attempted; IP rows show hours in the row but the
    // summary's Earned/Quality are 0. A dropped or misfiled row matches none.
    const matchesAny = [hours.attempted, hours.earned, hours.quality].some(
      (printedValue) => Math.abs(extractedHours - printedValue) <= 0.001
    );

    if (!matchesAny) {
      warnings.push(
        `${CREDIT_MISMATCH_MARKER}: ${term} extracted as ${extractedHours} credit hours but the transcript prints ${hours.attempted} attempted hours. A course may be missing or misread.`
      );
    }
  }
  return warnings;
}