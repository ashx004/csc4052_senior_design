// Turns a syllabus's one-line grade breakdown ("Exams 40%, Homework 30%, Project
// 30%") into slices for the course page's chart. Pure, so it is unit-tested.
// Anything that doesn't read as a clean breakdown returns null and the page
// falls back to showing the original text.

export interface GradeSlice {
  label: string;
  percent: number;
}

const SEGMENT_SPLIT = /\s*(?:[,;\n•]|\band\b|\+|\s\/\s)\s*/i;
const UNIT = "(%|pts?\\.?|points?)";
const LABEL_FIRST = new RegExp(`^(.+?)\\s*[:\\-–—=(]?\\s*(\\d+(?:\\.\\d+)?)\\s*${UNIT}\\)?$`, "i");
const VALUE_FIRST = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*${UNIT}\\s*[:\\-–—]?\\s*(.+)$`, "i");
// A letter-grade scale ("Scale: A>=90%, B>=80%, ...") often follows the weights.
// It is not part of the breakdown, so everything from its heading on is dropped.
const SCALE_TAIL = /[;.,\n]?\s*\b(?:grading\s+|letter\s+)?(?:scale|grades?|cut-?offs?)\s*[:=][\s\S]*$/i;

function cleanLabel(label: string): string {
  return label.replace(/^[\s:\-–—(]+|[\s:\-–—()]+$/g, "").replace(/\s+/g, " ").trim();
}

export function parseGradingBreakdown(text: string | undefined | null): GradeSlice[] | null {
  if (!text) return null;
  const weights: { label: string; value: number; points: boolean }[] = [];
  for (const raw of text.replace(SCALE_TAIL, "").split(SEGMENT_SPLIT)) {
    const segment = raw.trim().replace(/\.$/, "");
    if (!segment) continue;
    const labelFirst = LABEL_FIRST.exec(segment);
    const valueFirst = labelFirst ? null : VALUE_FIRST.exec(segment);
    const label = labelFirst ? cleanLabel(labelFirst[1]) : valueFirst ? cleanLabel(valueFirst[3]) : "";
    const value = Number(labelFirst ? labelFirst[2] : valueFirst?.[1]);
    const unit = labelFirst ? labelFirst[3] : valueFirst?.[2];
    // One unreadable piece means the sentence isn't a plain list of weights.
    if (!label || !unit || !Number.isFinite(value) || value <= 0) return null;
    weights.push({ label, value, points: unit !== "%" });
  }
  if (weights.length < 2) return null;

  // Points ("Exams 300 pts, Homework 60 pts") become shares of the points total.
  // Mixing points with percents can't be charted honestly.
  if (weights.some((w) => w.points)) {
    if (!weights.every((w) => w.points)) return null;
    const total = weights.reduce((sum, w) => sum + w.value, 0);
    return weights.map((w) => ({ label: w.label, percent: Math.round((w.value / total) * 1000) / 10 }));
  }

  if (weights.some((w) => w.value > 100)) return null;
  const slices = weights.map((w) => ({ label: w.label, percent: w.value }));
  // Weights that don't add up to a whole grade would draw a misleading chart.
  const total = slices.reduce((sum, slice) => sum + slice.percent, 0);
  return total >= 95 && total <= 105 ? slices : null;
}
