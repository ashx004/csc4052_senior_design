// Prices for providers that don't report a cost per request. OpenRouter
// reports usage.cost on every response, so it needs no table. Each rate has
// the date it took effect, so a scheduled change (Gemini Flash doubles on
// 2027-01-01) applies on its own, and a charge always uses the rate in force
// when the request ran. USD per 1M tokens; Gemini output includes thinking.
// Source: ai.google.dev/gemini-api/docs/pricing, checked 2026-10-18.
type Rate = { effectiveFrom: string; inputPerM: number; outputPerM: number };

const RATES: Record<string, Rate[]> = {
  "google:gemini-3.1-flash-lite": [{ effectiveFrom: "2026-01-01", inputPerM: 0.25, outputPerM: 1.5 }],
  "google:gemini-3.5-flash-lite": [{ effectiveFrom: "2026-01-01", inputPerM: 0.3, outputPerM: 2.5 }],
  "google:gemini-3.8-flash": [
    { effectiveFrom: "2026-01-01", inputPerM: 0.75, outputPerM: 3.75 },
    { effectiveFrom: "2027-01-01", inputPerM: 1.5, outputPerM: 7.5 },
  ],
};

/** The rate in force for `model` at `at`, or null when the model has no table entry. */
export function rateFor(model: string, at: Date = new Date()): (Rate & { id: string }) | null {
  const day = at.toISOString().slice(0, 10);
  const current = (RATES[model] ?? []).filter((r) => r.effectiveFrom <= day).at(-1);
  return current ? { ...current, id: `${model}@${current.effectiveFrom}` } : null;
}
