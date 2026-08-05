export type Term = "Fall" | "Winter" | "Spring" | "Summer";

export interface TermInfo {
  term: Term;
  year: number;
}

const TERM_ORDER: Term[] = ["Fall", "Winter", "Spring", "Summer"];

// LA Tech's academic calendar isn't documented anywhere authoritative in this
// app or its data sources — these month boundaries are a documented
// assumption, not a confirmed fact:
//   Fall:   Sep–Dec      Winter: Jan–Mar
//   Spring: Apr–Jun      Summer: Jul–Aug
export function getCurrentTerm(date: Date = new Date()): TermInfo {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if (month >= 9) return { term: "Fall", year };
  if (month <= 3) return { term: "Winter", year };
  if (month <= 6) return { term: "Spring", year };
  return { term: "Summer", year };
}

// Explicit switch, not modulo arithmetic, so the Fall->Winter year rollover
// is unambiguous and reviewable at a glance.
export function getNextTerm(date: Date = new Date()): TermInfo {
  const current = getCurrentTerm(date);
  switch (current.term) {
    case "Fall":
      return { term: "Winter", year: current.year + 1 };
    case "Winter":
      return { term: "Spring", year: current.year };
    case "Spring":
      return { term: "Summer", year: current.year };
    case "Summer":
      return { term: "Fall", year: current.year };
  }
}

export function formatTerm(info: TermInfo): string {
  return `${info.term} ${info.year}`;
}

// Best-effort parse of old free-text term values entered before structured
// season/year fields existed — e.g. "Fall 2026", "F26", "2026 Fall". Returns
// null rather than guessing when the text doesn't clearly contain both a
// recognizable season and a year.
export function parseTermString(raw: string | undefined | null): TermInfo | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;

  const seasonMatch = TERM_ORDER.find((t) => new RegExp(t, "i").test(text));

  // Captures the year digits directly from the abbreviation match (e.g.
  // "F26") rather than re-scanning the whole string for a standalone
  // \d{2,4} token — the digits sit glued to the abbreviation letter with no
  // word boundary between them, so an independent scan below would never
  // find them.
  const abbrevMatch = !seasonMatch
    ? (Object.entries({ F: "Fall", W: "Winter", Sp: "Spring", Su: "Summer" })
        .map(([abbrev, fullTerm]) => {
          const match = text.match(new RegExp(`\\b${abbrev}'?(\\d{2,4})\\b`, "i"));
          return match ? { term: fullTerm as Term, yearDigits: match[1] } : null;
        })
        .find((m) => m !== null))
    : undefined;

  const term = seasonMatch ?? abbrevMatch?.term;
  if (!term) return null;

  const rawYear = abbrevMatch?.yearDigits ?? (text.match(/\b(20\d{2})\b/) ?? text.match(/\b(\d{2})\b/))?.[1];
  if (!rawYear) return null;

  const year = rawYear.length === 2 ? 2000 + parseInt(rawYear, 10) : parseInt(rawYear, 10);
  if (!Number.isFinite(year)) return null;

  return { term, year };
}

// Splits a free-text course code like "CSC 4550" / "CSC4550" / "csc-4550"
// into a normalized subject prefix and course number.
export function parseCourseCode(raw: string | undefined | null): { subject: string; number: string } | null {
  if (!raw) return null;
  const match = raw.trim().match(/^([A-Za-z]+)[\s-]*([0-9][0-9A-Za-z]*)$/);
  if (!match) return null;
  return { subject: match[1].toUpperCase(), number: match[2].toUpperCase() };
}

// Normalizes a course code for equality comparison regardless of spacing/case
// (e.g. "CSC 4550", "CSC4550", "csc-4550" all normalize to "CSC4550").
export function normalizeCourseCode(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
