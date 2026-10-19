import "server-only";
import Stripe from "stripe";

// One Stripe client per server. STRIPE_SECRET_KEY is sk_test_... until the
// account is activated and the flow verified (docs/LAUNCH_CHECKLIST.md).
let client: Stripe | null = null;

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return (client ??= new Stripe(key));
}

/** Top-up amounts offered, in whole dollars. The $5 minimum and $20 cap are in money.ts. */
export const TOP_UP_OPTIONS_USD = [5, 10, 20] as const;
