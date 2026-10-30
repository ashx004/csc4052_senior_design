import { conceptKey } from "@/src/library/studyPlan/conceptKey";
import { QUIZ_DIFFICULTIES } from "@/src/library/quizDifficulty";
import type { ConceptQuota } from "./allocateConceptQuotas";

export interface ConceptFocus {
  quotas: ConceptQuota[];
  /** Every question text already asked from these documents. */
  avoid: string[];
}

/**
 * A prompt fragment aiming generation at specific concepts. Empty when there
 * are no quotas, so unfocused calls are unchanged.
 *
 * The counts are a hint for the model. The real guarantee is the per-item
 * conceptKey, which lets the caller check what actually came back.
 */
export function conceptFocusPrompt(focus: ConceptFocus): string {
  if (focus.quotas.length === 0) return "";
  const lines = focus.quotas.map(
    (q) =>
      `- ${q.label} (conceptKey: "${q.conceptKey}"): exactly ${q.items} ${q.items === 1 ? "item" : "items"}${
        q.level ? `, at the "${q.level}" level` : ""
      }`,
  );
  return `\n\nFocus this set on the following concepts, with the number of items each needs:
${lines.join("\n")}

Every generated item must include a "conceptKey" field whose value is exactly one of the conceptKey strings above, naming the concept that item tests. Do not invent other conceptKey values.`;
}

/**
 * Ties each generated question that names a focused concept to that concept's own label, so
 * scoring and weak-spot naming use the concept the set was aimed at rather than the model's
 * free-text `concept`. Questions without a matching conceptKey are returned unchanged.
 */
export function tagFocusedQuestions<T>(questions: readonly T[], focus: ConceptFocus): T[] {
  const quotaByKey = new Map(focus.quotas.map((quota) => [conceptKey(quota.conceptKey), quota]));
  return questions.map((question) => {
    if (!question || typeof question !== "object") return question;
    const raw = (question as Record<string, unknown>).conceptKey;
    const quota = typeof raw === "string" ? quotaByKey.get(conceptKey(raw)) : undefined;
    if (!quota) return question;
    return { ...question, conceptKey: quota.conceptKey, concept: quota.label };
  });
}

/** Joins avoid lists, dropping blanks and exact repeats. */
export function mergeAvoid(...lists: (readonly string[] | undefined)[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const list of lists) {
    for (const text of list ?? []) {
      if (typeof text !== "string" || !text.trim() || seen.has(text)) continue;
      seen.add(text);
      merged.push(text);
    }
  }
  return merged;
}

const MAX_FOCUS_QUOTAS = 20;
const MAX_FOCUS_AVOID = 60;

/**
 * Reads a focus from an untrusted request body. Anything malformed is dropped,
 * and a body with no usable quota means no focus at all.
 */
export function parseConceptFocus(value: unknown): ConceptFocus | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as { quotas?: unknown; avoid?: unknown };
  const quotas: ConceptQuota[] = [];
  if (Array.isArray(raw.quotas)) {
    for (const item of raw.quotas.slice(0, MAX_FOCUS_QUOTAS)) {
      if (!item || typeof item !== "object") continue;
      const { conceptKey, label, items, level } = item as Record<string, unknown>;
      if (typeof conceptKey !== "string" || typeof label !== "string") continue;
      if (typeof items !== "number" || !Number.isInteger(items) || items < 1) continue;
      if (!conceptKey.trim() || !label.trim()) continue;
      const quota: ConceptQuota = { conceptKey: conceptKey.slice(0, 200), label: label.slice(0, 200), items };
      const difficulty = QUIZ_DIFFICULTIES.find((d) => d === level);
      if (difficulty) quota.level = difficulty;
      quotas.push(quota);
    }
  }
  if (quotas.length === 0) return undefined;
  const avoid = Array.isArray(raw.avoid)
    ? raw.avoid.filter((q): q is string => typeof q === "string" && q.trim().length > 0).slice(0, MAX_FOCUS_AVOID).map((q) => q.slice(0, 500))
    : [];
  return { quotas, avoid };
}
