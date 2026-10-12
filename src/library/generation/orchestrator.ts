// Generates one study set from several sources.
//
// The shape of this function is the whole point of the feature: one
// generation call per source, each with a quota decided in code, rather
// than one big prompt containing every document. A single large prompt
// gives its middle sources the least attention, so "covers all five
// lectures" becomes a hope instead of a guarantee. Here it is arithmetic.
//
// `generate` is injected so this is testable without a model, and so the
// same orchestration serves both flashcards and quizzes.

import { allocateQuotas } from "./allocateQuotas";
import { verifyGrounding, type GroundedItem } from "./verify";
import { GENERATION_DEADLINE_MS } from "@/src/library/structuredGeneration";
import type { ResolvedSource } from "@/src/library/sources/sourceTypes";

/** Extra attempts per source after the first, when verification leaves a shortfall. */
export const MAX_BACKFILL_ATTEMPTS = 1;

/**
 * One bound across the whole per-source loop.
 *
 * GENERATION_DEADLINE_MS is computed inside each generator call, so every
 * source gets its own fresh 120 seconds; ten sources with a backfill each
 * is therefore twenty serial calls and well over half an hour inside one
 * HTTP request. Before this feature a generation request could never
 * outlive a single 120-second deadline, so the outer bound is set at twice
 * that: enough for a notebook of several notes at a normal call latency,
 * and a hard stop for the pathological case. This does not replace the
 * per-call deadline; it sits outside it.
 */
export const TOTAL_BUDGET_MS = 2 * GENERATION_DEADLINE_MS;

export type SourceAudit = {
  title: string;
  resourceId: string | null;
  requested: number;
  produced: number;
  viaRetrieval: boolean;
  /**
   * Present only when a source was never attempted. `produced: 0` alone
   * cannot tell "the model gave nothing usable" from "we ran out of time
   * before reaching this note", and the caller shows the student different
   * things in those two cases. Optional, so existing audit consumers and
   * the JSON they return are unchanged.
   */
  skippedReason?: "time-budget";
};

export type OrchestratorResult<T> = {
  items: T[];
  audit: SourceAudit[];
  topicName: string;
};

export type GenerateForSource<T> = (
  source: ResolvedSource,
  quota: number,
  alreadyAsked: string[]
) => Promise<{ topicName: string; items: T[] }>;

export type OrchestratorArgs<T> = {
  sources: ResolvedSource[];
  count: number;
  generate: GenerateForSource<T>;
  /** One shuffled pool across sources — always true for flashcards. */
  shuffle?: boolean;
  /** Injected for deterministic tests. */
  random?: () => number;
  /** Optional per-resource weighting; ignored when absent. */
  weights?: Record<string, number>;
  /** Reads a question's text for cross-source duplicate detection. */
  textOf?: (item: T) => string;
  /** Outer time bound across every source; injectable so tests need not wait. */
  budgetMs?: number;
  /** Injected for deterministic tests. */
  now?: () => number;
};

export async function generateAcrossSources<T extends GroundedItem>(
  args: OrchestratorArgs<T>
): Promise<OrchestratorResult<T>> {
  const {
    sources,
    count,
    generate,
    weights,
    shuffle = false,
    random = Math.random,
    budgetMs = TOTAL_BUDGET_MS,
    now = Date.now,
  } = args;
  const textOf = args.textOf ?? ((item: T) => String((item as { question?: unknown }).question ?? ""));

  // Throws for an empty list or a count below the per-source floor, before
  // any model call is made.
  const quotas = allocateQuotas(
    sources.map((s) => ({ id: s.resourceId ?? s.title, textLength: s.text.length })),
    count,
    weights
  );

  const audit: SourceAudit[] = [];
  const perSource: T[][] = [];
  let topicName = "";
  // Cross-source duplicates are caught by normalized question text here;
  // embedding-based de-duplication is a separate, optional pass.
  const seenQuestions = new Set<string>();
  const budgetDeadline = now() + budgetMs;

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const quota = quotas[i];
    const accepted: T[] = [];
    const asked: string[] = [];

    // Stop reaching for new sources once the budget is gone, and say in the
    // audit which notes were never looked at - a short set the caller can
    // explain beats a request that runs for half an hour. The first source
    // is always attempted, so an empty result still means the model failed
    // rather than the clock, which is what the routes' 502 claims.
    if (i > 0 && now() >= budgetDeadline) {
      for (let j = i; j < sources.length; j++) {
        audit.push({
          title: sources[j].title,
          resourceId: sources[j].resourceId,
          requested: quotas[j],
          produced: 0,
          viaRetrieval: sources[j].viaRetrieval,
          skippedReason: "time-budget",
        });
      }
      break;
    }

    for (let attempt = 0; attempt <= MAX_BACKFILL_ATTEMPTS && accepted.length < quota; attempt++) {
      // A backfill is a second chance, not an obligation; never start one
      // after the budget has run out.
      if (attempt > 0 && now() >= budgetDeadline) break;
      const needed = quota - accepted.length;
      let produced: { topicName: string; items: T[] };
      try {
        produced = await generate(source, needed, asked);
      } catch (error) {
        console.warn(`Generation failed for "${source.title}":`, error);
        break;
      }
      if (!topicName && produced.topicName) topicName = produced.topicName;

      // Every item must quote the text that was actually sent for THIS
      // source — that is what makes the citation meaningful.
      const { kept } = verifyGrounding(produced.items, source.text);
      for (const item of kept) {
        const key = normalizeQuestionKey(textOf(item));
        if (!key || seenQuestions.has(key)) continue;
        seenQuestions.add(key);
        accepted.push(item);
        asked.push(textOf(item));
        if (accepted.length === quota) break;
      }
    }

    perSource.push(accepted);
    audit.push({
      title: source.title,
      resourceId: source.resourceId,
      requested: quota,
      produced: accepted.length,
      viaRetrieval: source.viaRetrieval,
    });
  }

  let items = perSource.flat();
  if (shuffle) items = shuffled(items, random);

  return { items, audit, topicName };
}

function normalizeQuestionKey(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

// One pool across every source, rather than a sub-deck per lecture: a
// larger shuffled pool puts more intervening items between repeats, which
// is the measured benefit (see the spec's research section).
function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
