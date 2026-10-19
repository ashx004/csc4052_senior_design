import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/src/library/billing/stripe";
import { creditForPayment } from "@/src/library/billing/money";
import { creditPurchase, reverseCredit } from "@/src/library/billing/wallet";

// Stripe calls this when money moves. It is the only way credit is ever
// added: the signature check proves the event came from Stripe, and every
// amount is read from Stripe's own record of the payment. Each event is
// applied once (stripeEvents/{eventId}), since Stripe retries deliveries.
//
// Events to enable on the endpoint: checkout.session.completed,
// checkout.session.async_payment_succeeded, charge.refunded,
// charge.dispute.created.

const micros = (cents: number) => cents * 10_000;

async function applyCheckout(event: Stripe.Event, session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return; // async methods finish later, in async_payment_succeeded
  const uid = session.metadata?.uid;
  if (!uid || session.client_reference_id !== uid) throw new Error(`Checkout ${session.id} has no matching uid.`);
  const paidMicros = micros(session.amount_total ?? 0);
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  // The credit is what the student paid minus the fee Stripe really kept, read
  // from Stripe's own record: 2.9% + 30¢ is only the US-card price, and
  // international cards cost more. Never trusted from the session metadata.
  const feeMicros = paymentIntentId ? await stripeFeeMicros(paymentIntentId) : null;
  const creditMicros = feeMicros === null ? creditForPayment(paidMicros) : Math.max(0, paidMicros - feeMicros);
  await creditPurchase(uid, creditMicros, { eventId: event.id, paymentIntentId, paidMicros });
}

/**
 * Stripe's processing fee on a payment, or null to use the standard rate.
 * Stripe writes the fee a few seconds after the payment succeeds (measured
 * ~3s in test mode), often after this webhook arrives, so it is polled
 * briefly; Stripe gives a webhook well over this long to answer.
 */
async function stripeFeeMicros(paymentIntentId: string): Promise<number | null> {
  for (const waitMs of [0, 2000, 2000, 2000]) {
    if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
    try {
      const intent = await stripe().paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] });
      const charge = intent.latest_charge && typeof intent.latest_charge === "object" ? intent.latest_charge : null;
      const txn = charge?.balance_transaction && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
      if (txn) return micros(txn.fee);
    } catch (error) {
      console.error(`[billing] couldn't read the fee for ${paymentIntentId}:`, error);
      return null;
    }
  }
  console.warn(`[billing] fee for ${paymentIntentId} not ready; credited at the standard rate.`);
  return null;
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "Not configured" }, { status: 400 });

  let event: Stripe.Event;
  try {
    // The raw body, byte for byte: the signature covers it exactly.
    event = stripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await applyCheckout(event, event.data.object);
        break;
      case "charge.refunded": {
        const charge = event.data.object;
        const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        if (pi) await reverseCredit(pi, micros(charge.amount_refunded), "refund", event.id);
        break;
      }
      case "charge.dispute.created": {
        // Terms: credit from a disputed payment is removed while the dispute is open.
        const dispute = event.data.object;
        const pi = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
        if (pi) await reverseCredit(pi, micros(dispute.amount), "dispute", event.id);
        break;
      }
    }
  } catch (error) {
    // A 500 makes Stripe retry later, which is what we want for a transient failure.
    console.error(`[billing] webhook ${event.type} ${event.id} failed:`, error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
