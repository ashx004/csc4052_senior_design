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
  // Recomputed from what Stripe actually charged, not trusted from metadata.
  const creditMicros = creditForPayment(paidMicros);
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  await creditPurchase(uid, creditMicros, { eventId: event.id, paymentIntentId, paidMicros });
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
