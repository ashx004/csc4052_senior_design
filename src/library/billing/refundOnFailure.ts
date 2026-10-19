import "server-only";
import { runWithSpend, type SpendTracker } from "@/src/library/ai/usageScope";
import { billingMode } from "./usageMeter";
import { refundFailedWork } from "./wallet";

/**
 * Wraps an AI route so a failure on our side costs the student nothing: when
 * the route answers with a server error (5xx), whatever its AI calls were
 * charged goes straight back. Client errors (bad input, out of credit) never
 * reach the AI, so they have nothing to refund.
 *
 *   async function handlePOST(request: NextRequest) { ... }
 *   export const POST = refundOnFailure("quiz-generation", handlePOST);
 */
export function refundOnFailure<Args extends unknown[]>(feature: string, handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    const spend: SpendTracker = { micros: 0 };
    const response = await runWithSpend(spend, () => handler(...args));
    if (response.status >= 500) await refundSpend(spend, feature);
    return response;
  };
}

/** Gives back what `spend` recorded, once. Never throws. */
export async function refundSpend(spend: SpendTracker, feature: string): Promise<void> {
  if (billingMode() !== "enforce" || !spend.uid || spend.micros <= 0) return;
  const amount = spend.micros;
  spend.micros = 0;
  try {
    await refundFailedWork(spend.uid, amount, feature);
    console.info(`[billing] refunded ${amount} micros to ${spend.uid} for a failed ${feature}`);
  } catch (error) {
    console.error(`[billing] could not refund a failed ${feature} for ${spend.uid}:`, error);
  }
}
