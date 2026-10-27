import { z } from "zod";
import { conceptKey, isUsableConceptLabel } from "./conceptKey";
import type { ConceptWeakSpot } from "./types";

export interface QuestionToName {
  questionId: string;
  question: string;
  correctAnswer: string;
}

export interface NamedConcept {
  questionId: string;
  /** null when the model gave nothing usable — the miss is held, never dropped. */
  label: string | null;
}

// Each entry is checked on its own so one bad entry nulls only its own
// question, not every other label the model got right.
const responseSchema = z.object({ concepts: z.array(z.unknown()) });
const entrySchema = z.object({ questionId: z.string(), label: z.string() });

/**
 * Key matching only: a label whose normalised key already belongs to an
 * existing concept takes that concept's display label. Whether two
 * differently-worded labels are the same idea is the model's call, made in
 * the same request as the naming (the prompt asks it to reuse a label verbatim).
 */
export function mergeIntoExistingConcept(
  label: string,
  existing: Pick<ConceptWeakSpot, "conceptKey" | "label">[],
): string {
  const key = conceptKey(label);
  return existing.find((concept) => concept.conceptKey === key)?.label ?? label;
}

/**
 * One entry per asked question, in the asked order, whatever the model sent.
 * A missing, malformed, empty or placeholder label becomes `label: null`.
 */
export function parseNamingResponse(raw: unknown, asked: QuestionToName[]): NamedConcept[] {
  const labels = new Map<string, string>();
  const parsed = responseSchema.safeParse(raw);
  if (parsed.success) {
    for (const item of parsed.data.concepts) {
      const entry = entrySchema.safeParse(item);
      if (!entry.success) continue;
      const label = entry.data.label.trim();
      if (!isUsableConceptLabel(label)) continue;
      if (!labels.has(entry.data.questionId)) labels.set(entry.data.questionId, label);
    }
  }
  return asked.map((q) => ({ questionId: q.questionId, label: labels.get(q.questionId) ?? null }));
}

const DEFAULT_MAX_ASKED = 40;
const DEFAULT_MAX_FIELD_CHARS = 500;

export interface NamingPlan {
  /** One id per question the caller sent that has a questionId, in the order sent. */
  ids: string[];
  /** The subset worth sending to the model: usable text, first of its id, within the cap. */
  toAsk: QuestionToName[];
}

/**
 * Splits what the caller sent into every id that must come back and the
 * subset the model is asked about. A question that is not sent (over the
 * cap, empty text, repeated id) still comes back, with `label: null`.
 */
export function planNaming(
  raw: unknown[],
  limits: { maxAsked?: number; maxFieldChars?: number } = {},
): NamingPlan {
  const maxAsked = limits.maxAsked ?? DEFAULT_MAX_ASKED;
  const maxChars = limits.maxFieldChars ?? DEFAULT_MAX_FIELD_CHARS;
  const ids: string[] = [];
  const toAsk: QuestionToName[] = [];
  const asked = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { questionId, question, correctAnswer } = item as Record<string, unknown>;
    if (typeof questionId !== "string" || !questionId.trim()) continue;
    ids.push(questionId);
    if (asked.has(questionId) || toAsk.length >= maxAsked) continue;
    if (typeof question !== "string" || !question.trim()) continue;
    asked.add(questionId);
    toAsk.push({
      questionId,
      question: question.slice(0, maxChars),
      correctAnswer: typeof correctAnswer === "string" ? correctAnswer.slice(0, maxChars) : "",
    });
  }
  return { ids, toAsk };
}

/**
 * The response body: one entry per planned id, in order. Only the first
 * occurrence of an id that was sent to the model carries its label (merged
 * onto an existing concept by key); everything else is null.
 */
export function finishNaming(
  plan: NamingPlan,
  named: NamedConcept[],
  existing: Pick<ConceptWeakSpot, "conceptKey" | "label">[],
): NamedConcept[] {
  const labels = new Map<string, string | null>();
  for (const n of named) {
    labels.set(n.questionId, n.label === null ? null : mergeIntoExistingConcept(n.label, existing));
  }
  const used = new Set<string>();
  return plan.ids.map((questionId) => {
    const first = !used.has(questionId);
    used.add(questionId);
    return { questionId, label: first ? (labels.get(questionId) ?? null) : null };
  });
}
