import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyBillingAuth } from "@/src/library/billing/verifyBillingAuth";
import { checkRateLimit } from "@/src/library/rateLimit";
import { MAX_BALANCE_MICROS, creditForPayment, formatUsd, usdToMicros } from "@/src/library/billing/money";
import { TOP_UP_OPTIONS_USD, stripe } from "@/src/library/billing/stripe";
import { getWallet, recordCreditTerms } from "@/src/library/billing/wallet";
import { TERMS_VERSION } from "@/src/library/legalVersion";

// Starts a Stripe Checkout payment for AI credit. The browser only picks one
// of the fixed amounts; the uid, the credit it buys and the price all come
// from the server, and credit is only added when Stripe's signed webhook
// confirms the payment (../webhook/route.ts), never from this request.

const bodySchema = z.object({
  amountUsd: z.number().refine((n) => (TOP_UP_OPTIONS_USD as readonly number[]).includes(n), "Pick one of the listed amounts."),
  // The checkbox in the add-credit window: 18+ (or a parent paying) and the credit terms.
  acceptedTerms: z.literal(true),
});

export async function POST(request: NextRequest) {
  const auth = await verifyBillingAuth(request);
  if (!auth) return NextResponse.json({ error: "Please sign in again to add credit." }, { status: 401 });

  // Card testing (fraudsters trying stolen cards with small payments) needs many attempts.
  const limit = checkRateLimit(`checkout:${auth.uid}`, 10 * 60_000, 5);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many payment attempts. Please wait a few minutes." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose an amount and accept the terms to continue." }, { status: 400 });

  const paidMicros = usdToMicros(parsed.data.amountUsd);
  const creditMicros = creditForPayment(paidMicros);
  const wallet = await getWallet(auth.uid);
  if (wallet.balanceMicros + creditMicros > MAX_BALANCE_MICROS) {
    return NextResponse.json({ error: `Balances are capped at ${formatUsd(MAX_BALANCE_MICROS)}. Your balance is ${formatUsd(wallet.balanceMicros)}, so this top-up would go over.` }, { status: 400 });
  }

  const baseUrl = process.env.APP_BASE_URL || request.nextUrl.origin;
  await recordCreditTerms(auth.uid, TERMS_VERSION);
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: Math.round(paidMicros / 10_000),
        product_data: {
          name: "Catalyst AI credit",
          description: `${formatUsd(creditMicros)} of AI credit after card processing fees`,
        },
      },
    }],
    client_reference_id: auth.uid,
    customer_email: auth.email,
    // Read back by the webhook. Set here on the server, so a browser can't change them.
    metadata: { uid: auth.uid, creditMicros: String(creditMicros), termsVersion: TERMS_VERSION },
    payment_intent_data: { metadata: { uid: auth.uid } },
    success_url: `${baseUrl}/billing?checkout=success`,
    cancel_url: `${baseUrl}/billing?checkout=cancelled`,
  });
  if (!session.url) return NextResponse.json({ error: "Stripe didn't return a checkout page. Please try again." }, { status: 502 });
  return NextResponse.json({ url: session.url });
}
