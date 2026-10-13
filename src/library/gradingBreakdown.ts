// Turns a syllabus's one-line grade breakdown ("Exams 40%, Homework 30%, Project
// 30%") into slices for the course page's chart. Pure, so it is unit-tested.
// Anything that doesn't read as a clean breakdown returns null and the page
// falls back to showing the original text.

export interface GradeSlice {
  label: string;
  percent: number;
}

const SEGMENT_SPLIT = /\s*(?:[,;\n•]|\band\b|\+|\s\/\s)\s*/i;
const LABEL_FIRST = /^(.+?)\s*[:\-–—=(]?\s*(\d+(?:\.\d+)?)\s*%\)?$/;
const PERCENT_FIRST = /^(\d+(?:\.\d+)?)\s*%\s*[:\-–—]?\s*(.+)$/;

function cleanLabel(label: string): string {
  return label.replace(/^[\s:\-–—(]+|[\s:\-–—()]+$/g, "").replace(/\s+/g, " ").trim();
}

export function parseGradingBreakdown(text: string | undefined | null): GradeSlice[] | null {
  if (!text) return null;
  const slices: GradeSlice[] = [];
  for (const raw of text.split(SEGMENT_SPLIT)) {
    const segment = raw.trim().replace(/\.$/, "");
    if (!segment) continue;
    const labelFirst = LABEL_FIRST.exec(segment);
    const percentFirst = labelFirst ? null : PERCENT_FIRST.exec(segment);
    const label = labelFirst ? cleanLabel(labelFirst[1]) : percentFirst ? cleanLabel(percentFirst[2]) : "";
    const percent = Number(labelFirst ? labelFirst[2] : percentFirst?.[1]);
    // One unreadable piece means the sentence isn't a plain list of weights.
    if (!label || !Number.isFinite(percent) || percent <= 0 || percent > 100) return null;
    slices.push({ label, percent });
  }
  if (slices.length < 2) return null;
  // Weights that don't add up to a whole grade would draw a misleading chart.
  const total = slices.reduce((sum, slice) => sum + slice.percent, 0);
  return total >= 95 && total <= 105 ? slices : null;
}
