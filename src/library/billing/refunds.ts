import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { adminDb } from "@/src/library/firebaseAdmin";
import { stripe } from "./stripe";
import { getWallet, listPurchases, reverseCredit, setWalletFrozen, sweepStaleHolds, type PurchaseRecord } from "./wallet";

// Paying back a student's unused credit (docs/legal/credits-and-refunds.md):
// on request, when they delete their account, and at end of service. One
// code path for all three, so the amount is never worked out by hand.
//
//   1. Freeze the wallet: no new AI request can start.
//   2. Wait for requests already running to settle their charges.
//   3. Refuse if any of their payments has an open dispute, or the same
//      money would go back twice (once by the bank, once by us).
//   4. Refund the unused balance to the cards it came from, newest purchase
//      first, and record each refund straight away, so the charge.refunded
//      webhook that follows finds nothing left to take back.
//   5. Unfreeze, except for account deletion and end of service.
//
// The credit already excludes Stripe's fee (it was taken out at purchase),
// so refunding the credit itself is "minus the processing fee" exactly.

export class RefundBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefundBlockedError";
  }
}

export type RefundPlanItem = { paymentIntentId: string; cents: number };

/** Pure: which purchases to refund, and how much of each, to pay back `availableMicros`. */
export function planRefund(availableMicros: number, purchases: PurchaseRecord[]): { items: RefundPlanItem[]; leftoverMicros: number } {
  let remaining = Math.max(0, availableMicros);
  const items: RefundPlanItem[] = [];
  for (const p of purchases) {
    const refundable = Math.max(0, p.creditMicros - p.reversedMicros);
    // Whole cents only: Stripe refunds cents, and a fraction left behind is the student's to keep using.
    const cents = Math.floor(Math.min(remaining, refundable) / 10_000);
    if (cents <= 0) continue;
    items.push({ paymentIntentId: p.paymentIntentId, cents });
    remaining -= cents * 10_000;
  }
  return { items, leftoverMicros: remaining };
}

const OPEN_DISPUTE = new Set(["warning_needs_response", "warning_under_review", "needs_response", "under_review"]);

async function waitForHoldsToSettle(uid: string, db: Firestore) {
  for (let i = 0; i < 30; i++) {
    const wallet = await getWallet(uid, db);
    if (wallet.heldMicros <= 0) return wallet;
    await sweepStaleHolds(uid, db);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new RefundBlockedError("A reply is still being charged. Try again in a minute.");
}

export type RefundResult = { refundedMicros: number; items: RefundPlanItem[]; leftoverMicros: number; dryRun: boolean };

export async function refundUnusedCredit(
  uid: string,
  options: { reason: "requested" | "account-deletion" | "end-of-service"; dryRun?: boolean },
  db: Firestore = adminDb
): Promise<RefundResult> {
  const keepFrozen = options.reason !== "requested";
  const before = await getWallet(uid, db);
  if (before.balanceMicros <= 0 && before.heldMicros <= 0) {
    return { refundedMicros: 0, items: [], leftoverMicros: 0, dryRun: Boolean(options.dryRun) };
  }

  if (!options.dryRun) await setWalletFrozen(uid, true, options.reason, db);
  try {
    const wallet = options.dryRun ? before : await waitForHoldsToSettle(uid, db);
    const purchases = await listPurchases(uid, db);
    const plan = planRefund(wallet.balanceMicros - wallet.heldMicros, purchases);

    for (const item of plan.items) {
      const disputes = await stripe().disputes.list({ payment_intent: item.paymentIntentId, limit: 10 });
      if (disputes.data.some((d) => OPEN_DISPUTE.has(d.status))) {
        throw new RefundBlockedError(`Payment ${item.paymentIntentId} has an open dispute; resolve it in Stripe first.`);
      }
    }
    if (options.dryRun) return { refundedMicros: plan.items.reduce((s, i) => s + i.cents * 10_000, 0), ...plan, dryRun: true };

    let refundedMicros = 0;
    for (const item of plan.items) {
      const purchase = purchases.find((p) => p.paymentIntentId === item.paymentIntentId)!;
      const refund = await stripe().refunds.create(
        { payment_intent: item.paymentIntentId, amount: item.cents, metadata: { uid, reason: options.reason } },
        // A retried run must not refund the same slice twice.
        { idempotencyKey: `catalyst-refund-${item.paymentIntentId}-${purchase.reversedMicros}-${item.cents}` }
      );
      // Stripe's running total for this payment, which is what the webhook will report too.
      const intent = await stripe().paymentIntents.retrieve(item.paymentIntentId, { expand: ["latest_charge"] });
      const charge = intent.latest_charge && typeof intent.latest_charge === "object" ? intent.latest_charge : null;
      const totalRefundedMicros = (charge?.amount_refunded ?? item.cents) * 10_000;
      await reverseCredit(item.paymentIntentId, totalRefundedMicros, "refund", `refund_${refund.id}`, db);
      refundedMicros += item.cents * 10_000;
    }
    return { refundedMicros, ...plan, dryRun: false };
  } finally {
    if (!options.dryRun && !keepFrozen) await setWalletFrozen(uid, false, options.reason, db).catch(() => undefined);
  }
}
