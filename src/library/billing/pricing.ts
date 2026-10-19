// What a student is charged for an AI request, and how much is held before it
// runs. Pure: no Firebase, no network.
//
// The charge is the provider's cost plus the provider's own payment fee, and
// nothing else. OpenRouter keeps 5.5% of every credit purchase, and the cost
// it reports per request doesn't include that, so $1.00 of reported cost took
// $1.00 / 0.945 of real money to buy. Charging the reported cost alone would
// lose about 6% on every request. Override with BILLING_OPENROUTER_FEE if
// OpenRouter changes its fee; BILLING_GOOGLE_FEE likewise (0: Gemini prepay
// credit is bought at face value).

import { providerFor } from "@/src/library/ai/cloudTranslate";

function feeFor(model: string): number {
  const { provider } = providerFor(model);
  const raw = provider.name === "openrouter" ? process.env.BILLING_OPENROUTER_FEE ?? "0.055" : process.env.BILLING_GOOGLE_FEE ?? "0";
  const fee = Number(raw);
  if (!Number.isFinite(fee) || fee < 0 || fee >= 0.5) throw new Error(`Billing fee for ${model} is invalid: ${raw}`);
  return fee;
}

/** The student's charge for a request the provider billed at `costMicros`. Rounded up, never down. */
export function chargeForCost(costMicros: number, model: string): number {
  if (costMicros <= 0) return 0;
  return Math.ceil(costMicros / (1 - feeFor(model)));
}

// Prices used only to size the hold before a request runs. The charge itself
// always uses the provider's reported cost. Kept on the high side: a hold
// that's too big just means a student with $0.002 left is asked to top up a
// request early. USD per 1M tokens, from openrouter.ai/models (2026-10-18).
const HOLD_RATES: Record<string, { inputPerM: number; outputPerM: number }> = {
  "openrouter:google/gemma-4-26b-a4b-it": { inputPerM: 0.1, outputPerM: 0.35 },
  "openrouter:qwen/qwen3.7-flash": { inputPerM: 0.05, outputPerM: 0.2 },
  "openrouter:z-ai/glm-5.3-flash": { inputPerM: 0.08, outputPerM: 0.3 },
  "google:gemini-3.1-flash-lite": { inputPerM: 0.25, outputPerM: 1.5 },
  "google:gemini-3.5-flash-lite": { inputPerM: 0.3, outputPerM: 2.5 },
};
// A model missing above gets a deliberately expensive guess, so a new model
// can't run on a hold that's too small to cover it.
const UNKNOWN_RATE = { inputPerM: 1, outputPerM: 5 };

// Images cost far more than their base64 length suggests is "text". Most
// providers bill a phone photo at roughly 1,000-2,500 tokens.
const TOKENS_PER_IMAGE = 3000;

/** Rough, high-side token count for a request body: about 3 characters per token, plus each image. */
export function estimateInputTokens(body: { messages?: { content?: unknown; images?: string[] }[]; tools?: unknown[] }): number {
  let chars = 0;
  let images = 0;
  for (const m of body.messages ?? []) {
    chars += typeof m.content === "string" ? m.content.length : JSON.stringify(m.content ?? "").length;
    images += m.images?.length ?? 0;
  }
  if (body.tools?.length) chars += JSON.stringify(body.tools).length;
  return Math.ceil(chars / 3) + images * TOKENS_PER_IMAGE;
}

/** Worst case a request could be charged: every input token plus the full output cap, on the dearer of the models it may use. */
export function holdFor(models: string[], inputTokens: number, maxOutputTokens: number): number {
  const worst = Math.max(
    ...models.map((model) => {
      const rate = HOLD_RATES[model] ?? UNKNOWN_RATE;
      return chargeForCost(Math.ceil(inputTokens * rate.inputPerM + maxOutputTokens * rate.outputPerM), model);
    })
  );
  // At least one micro, since the wallet refuses zero holds.
  return Math.max(1, worst);
}

// What the billing page shows before a student starts a task. From the
// benchmark (scripts/cloud-benchmark-results.md) with real-chat context
// added, rounded up and fee included. Replace with dry-run averages once
// `npm run billing:report` has a few days of data.
export const TASK_ESTIMATES: { task: string; typicalUsd: number; note?: string }[] = [
  { task: "Chat message", typicalUsd: 0.002, note: "longer with documents attached or web search" },
  { task: "Quiz (10 questions)", typicalUsd: 0.003 },
  { task: "Flashcard set", typicalUsd: 0.002 },
  { task: "Practice problems", typicalUsd: 0.003 },
  { task: "Handwritten page (OCR)", typicalUsd: 0.002 },
  { task: "Uploading a document for search", typicalUsd: 0.002, note: "per 20 pages" },
  { task: "Advising schedule", typicalUsd: 0.01 },
];
