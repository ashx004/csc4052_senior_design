import "server-only";
import { NextResponse } from "next/server";
import { isCloudBackend } from "@/src/library/ai/cloudModels";
import { OUT_OF_CREDIT_MESSAGE } from "@/src/library/ai/aiFetch";
import { billingMode } from "./usageMeter";
import { getWallet, sweepStaleHolds } from "./wallet";
import { grantTrialIfEligible } from "./trial";

// About what one chat message holds. A student with less than this left gets
// the "add credit" prompt before a task starts, instead of having it fail
// partway (a quiz is several AI calls).
export const MIN_CREDIT_TO_START_MICROS = 5_000;

/** Header the browser looks for on a 402 to open the add-credit window (BillingProvider.tsx). */
export const OUT_OF_CREDIT_HEADER = "X-Catalyst-Billing";

export function outOfCreditResponse(balanceMicros: number) {
  return NextResponse.json(
    { error: OUT_OF_CREDIT_MESSAGE, code: "insufficient_credit", balanceMicros },
    { status: 402, headers: { [OUT_OF_CREDIT_HEADER]: "insufficient-credit" } }
  );
}

/**
 * Call right after enterAiUser(uid) in a route that starts AI work. Returns a
 * 402 to send back when the student can't pay, or null to carry on. This is
 * the friendly early check; aiFetch's hold on every request is the one that
 * actually guarantees nobody spends credit they don't have.
 */
export async function aiCreditGate(uid: string): Promise<NextResponse | null> {
  if (billingMode() !== "enforce" || !isCloudBackend()) return null;
  let wallet = await getWallet(uid);
  // Credit stuck in a hold from a crashed request shouldn't block anyone.
  if (wallet.balanceMicros - wallet.heldMicros < MIN_CREDIT_TO_START_MICROS && wallet.heldMicros > 0) {
    if (await sweepStaleHolds(uid)) wallet = await getWallet(uid);
  }
  if (!wallet.frozen && wallet.balanceMicros - wallet.heldMicros >= MIN_CREDIT_TO_START_MICROS) return null;
  // A brand-new student whose first AI request beat the wallet page load.
  if (!wallet.frozen && (await grantTrialIfEligible(uid).catch(() => 0)) >= MIN_CREDIT_TO_START_MICROS) return null;
  return outOfCreditResponse(wallet.balanceMicros);
}
