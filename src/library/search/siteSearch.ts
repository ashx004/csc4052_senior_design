import type { SearchEntry } from "./siteSearchIndex";

// Ranks search entries against what the student typed. Runs in the browser:
// the index is a fixed list of pages and features, so there's nothing to
// fetch and results update on every keystroke.
//
// Every word typed must match the entry somewhere (so "dark mode" doesn't
// return everything mentioning "mode"); each word scores by where it
// matched, best first: title > keyword > description, whole word > start of
// a word > anywhere inside one. Words of 4+ letters also match with a
// one-letter typo ("calender"), scored low.

const SCORE = {
  titleExact: 1000,
  titleStart: 400,
  titleWord: 120,
  titleWordStart: 90,
  titleContains: 40,
  keywordWord: 70,
  keywordWordStart: 50,
  keywordContains: 20,
  descriptionWord: 15,
  descriptionWordStart: 10,
  typo: 8,
};

const MIN_TYPO_LENGTH = 4;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function words(text: string): string[] {
  const normalized = normalize(text);
  return normalized ? normalized.split(" ") : [];
}

// True if a and b differ by at most one inserted, deleted, or changed letter.
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

type PreparedEntry = {
  entry: SearchEntry;
  title: string;
  shortTitle: string | null;
  titleWords: string[];
  keywordWords: string[];
  keywordText: string;
  descriptionWords: string[];
};

function prepare(entry: SearchEntry): PreparedEntry {
  const keywordText = normalize(entry.keywords.join(" "));
  return {
    entry,
    title: normalize(entry.title),
    shortTitle: entry.shortTitle ? normalize(entry.shortTitle) : null,
    titleWords: words(entry.title),
    keywordWords: keywordText ? keywordText.split(" ") : [],
    keywordText,
    descriptionWords: words(entry.description),
  };
}

// Best score for one typed word against one entry, or 0 if it matches nowhere.
function scoreWord(word: string, prepared: PreparedEntry): number {
  const { titleWords, title, keywordWords, keywordText, descriptionWords } = prepared;

  if (titleWords.includes(word)) return SCORE.titleWord;
  if (titleWords.some((w) => w.startsWith(word))) return SCORE.titleWordStart;
  if (keywordWords.includes(word)) return SCORE.keywordWord;
  if (keywordWords.some((w) => w.startsWith(word))) return SCORE.keywordWordStart;
  if (word.length >= 3 && title.includes(word)) return SCORE.titleContains;
  if (word.length >= 3 && keywordText.includes(word)) return SCORE.keywordContains;
  if (descriptionWords.includes(word)) return SCORE.descriptionWord;
  if (word.length >= 3 && descriptionWords.some((w) => w.startsWith(word))) return SCORE.descriptionWordStart;

  if (word.length >= MIN_TYPO_LENGTH) {
    const candidates = [...titleWords, ...keywordWords];
    if (candidates.some((w) => w.length >= MIN_TYPO_LENGTH && withinOneEdit(word, w))) return SCORE.typo;
  }
  return 0;
}

export function searchSite(query: string, entries: SearchEntry[], limit = 8): SearchEntry[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  const queryWords = normalizedQuery.split(" ");

  const scored: { entry: SearchEntry; score: number; index: number }[] = [];

  entries.forEach((entry, index) => {
    const prepared = prepare(entry);

    let score = 0;
    for (const word of queryWords) {
      const wordScore = scoreWord(word, prepared);
      if (wordScore === 0) return; // every typed word must match something
      score += wordScore;
    }

    const titles = prepared.shortTitle ? [prepared.title, prepared.shortTitle] : [prepared.title];
    if (titles.includes(normalizedQuery)) score += SCORE.titleExact;
    else if (titles.some((t) => t.startsWith(normalizedQuery))) score += SCORE.titleStart;

    // When otherwise tied: the current class's own sections first (the
    // student is in that class), then pages before the features inside them.
    if (entry.category === "This class") score += 2;
    else if (entry.category === "Page") score += 1;

    scored.push({ entry, score, index });
  });

  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((result) => result.entry);
}
