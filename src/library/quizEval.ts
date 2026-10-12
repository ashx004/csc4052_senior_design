// Pure helpers for scripts/quizQualityEval.ts (Story 2's quiz-quality
// comparison). Kept in src/library so vitest covers them.

const words = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** Share (0–1) of the question's `run`-word sequences found word-for-word in the document. */
export function copiedRatio(question: string, documentText: string, run = 5): number {
  const q = words(question);
  if (q.length < run) return 0;
  const doc = ` ${words(documentText).join(" ")} `;
  let copied = 0;
  for (let i = 0; i + run <= q.length; i++) {
    if (doc.includes(` ${q.slice(i, i + run).join(" ")} `)) copied++;
  }
  return copied / (q.length - run + 1);
}

export function toCsv(rows: (string | number)[][]): string {
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return rows.map((row) => row.map(cell).join(",")).join("\n") + "\n";
}

/** Minimal RFC 4180 reader: quoted cells, doubled quotes, CRLF, BOM. Blank rows dropped. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export const SCORE_COLUMNS = ["level_correct", "distractors_plausible", "one_right_answer"] as const;

export interface ScoreSummaryRow {
  model: string;
  difficulty: string;
  scored: number;
  level_correct: string;
  distractors_plausible: string;
  one_right_answer: string;
}

/** "yes/answered" per checklist column for each model × difficulty in a filled scoring sheet. */
export function summarizeScores(rows: string[][]): ScoreSummaryRow[] {
  const [header, ...data] = rows;
  const col = (name: string) => header.indexOf(name);
  const groups = new Map<string, string[][]>();
  for (const r of data) {
    const key = JSON.stringify([r[col("model")], r[col("difficulty")]]);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups].map(([key, items]) => {
    const [model, difficulty] = JSON.parse(key) as [string, string];
    const rate = (name: string) => {
      const answers = items.map((r) => (r[col(name)] ?? "").trim().toLowerCase()).filter(Boolean);
      const yes = answers.filter((a) => a === "y" || a === "yes").length;
      return answers.length ? `${yes}/${answers.length}` : "–";
    };
    return {
      model,
      difficulty,
      scored: items.length,
      level_correct: rate("level_correct"),
      distractors_plausible: rate("distractors_plausible"),
      one_right_answer: rate("one_right_answer"),
    };
  });
}
