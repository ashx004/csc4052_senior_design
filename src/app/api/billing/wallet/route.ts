import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { getWallet, recentLedger, sweepStaleHolds } from "@/src/library/billing/wallet";
import { MAX_BALANCE_MICROS, MIN_TOPUP_MICROS, creditForPayment, usdToMicros } from "@/src/library/billing/money";
import { TOP_UP_OPTIONS_USD } from "@/src/library/billing/stripe";
import { TASK_ESTIMATES } from "@/src/library/billing/pricing";
import { MIN_CREDIT_TO_START_MICROS } from "@/src/library/billing/creditGate";
import { billingMode } from "@/src/library/billing/usageMeter";
import { enterAiUser } from "@/src/library/ai/usageScope";
import { isCloudBackend } from "@/src/library/ai/cloudModels";

// The student's balance and history, read by the server so the wallet
// documents never need to be readable from the browser.
export async function GET(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // In AI_BACKEND=testers mode only listed accounts use (and pay for) cloud AI.
  enterAiUser(auth.uid);
  const enforced = billingMode() === "enforce" && isCloudBackend();

  const includeHistory = request.nextUrl.searchParams.get("history") === "1";
  let wallet = await getWallet(auth.uid);
  if (wallet.heldMicros > 0 && (await sweepStaleHolds(auth.uid))) wallet = await getWallet(auth.uid);

  return NextResponse.json({
    enforced,
    balanceMicros: wallet.balanceMicros,
    heldMicros: wallet.heldMicros,
    minToStartMicros: MIN_CREDIT_TO_START_MICROS,
    capMicros: MAX_BALANCE_MICROS,
    minTopUpMicros: MIN_TOPUP_MICROS,
    topUps: TOP_UP_OPTIONS_USD.map((usd) => {
      const creditMicros = creditForPayment(usdToMicros(usd));
      return { usd, creditMicros, fits: wallet.balanceMicros + creditMicros <= MAX_BALANCE_MICROS };
    }),
    estimates: TASK_ESTIMATES,
    ...(includeHistory ? { history: await recentLedger(auth.uid, 200) } : {}),
  });
}
