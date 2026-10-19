// Money is integer micro-dollars (1 USD = 1,000,000 micros) everywhere in
// billing: token costs are fractions of a cent, and floats would drift.
export const MICROS_PER_USD = 1_000_000;

export const usdToMicros = (usd: number) => Math.round(usd * MICROS_PER_USD);
export const microsToUsd = (micros: number) => micros / MICROS_PER_USD;

// Purchase limits from docs/legal/credits-and-refunds.md.
export const MIN_TOPUP_MICROS = usdToMicros(5);
export const MAX_BALANCE_MICROS = usdToMicros(20);

// Stripe US card pricing (2.9% + $0.30). Users pay it, ZonoCSC never absorbs it.
export const STRIPE_PERCENT = 0.029;
export const STRIPE_FIXED_MICROS = usdToMicros(0.3);

/** Credit that lands in the wallet when a user pays `paidMicros`: the payment minus Stripe's fee, rounded down. */
export function creditForPayment(paidMicros: number): number {
  const fee = Math.ceil(paidMicros * STRIPE_PERCENT) + STRIPE_FIXED_MICROS;
  return Math.max(0, paidMicros - fee);
}

/** Cost in micros of a request, rounded up so rounding never favors ZonoCSC's loss. Rates are USD per 1M tokens. */
export function tokenCostMicros(inputTokens: number, outputTokens: number, rate: { inputPerM: number; outputPerM: number }): number {
  // USD per 1M tokens equals micros per token, so this is a plain dot product.
  return Math.ceil(inputTokens * rate.inputPerM + outputTokens * rate.outputPerM);
}

export function formatUsd(micros: number): string {
  const usd = microsToUsd(micros);
  // Sub-cent amounts are normal for single AI requests; show them instead of "$0.00".
  return Math.abs(usd) < 0.01 && usd !== 0 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

/** Credit a student can spend now: the balance minus what running requests hold. */
export const availableMicros = (wallet: { balanceMicros: number; heldMicros: number }) => wallet.balanceMicros - wallet.heldMicros;
