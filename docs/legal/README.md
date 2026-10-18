# Legal documents (published as final, pending review)

Written alongside the cloud-AI billing work (branch `cloud_ai_billing`) and
worded as final. They describe what the code does or will do. They have not had
a legal review yet: see `docs/LAUNCH_CHECKLIST.md`.

| File | Covers |
|---|---|
| `terms-of-service.md` | Use of Catalyst, AI output, accounts, liability |
| `credits-and-refunds.md` | Prepaid AI credits, BYOK, refunds, and **end of service** (wind-down) |
| `privacy-policy.md` | What is collected, who processes it (AI providers, Stripe, Google), retention, deletion |

## Decisions made (2026-10-18)

- **Operator:** ZonoCSC, contact@zonocsc.com, governed by Louisiana law.
  Described as a not-for-profit project, not as a 501(c)(3), until IRS
  recognition (Form 1023 / 1023-EZ, after forming a Louisiana nonprofit
  corporation).
- **Refunds (consumer-friendly, zero-loss):** used credits are final. Unused
  balance is refundable on request, on account deletion, and automatically at
  end of service, always minus Stripe's non-returned fee, so a refund never costs
  ZonoCSC money. Billing mistakes are refunded in full. Fraud and charged-back
  balances are removed.
- **Balance:** $5 minimum top-up, $20 maximum balance.
- **Age (following OpenAI and Google):** 13+ to use the app. Under 18 needs a
  parent or guardian's permission. Buying credits requires 18+ or a parent or
  guardian's permission and payment method. Under 13 is not allowed (COPPA).

## Values in use

- Effective October 18, 2026. Planned end of service March 18, 2027.
- AI providers: OpenRouter and its model hosts, and Google Gemini API. Update this
  if the final model choice changes (`scripts/cloud-benchmark-results.md`).
- **Engineering must make true:** requests go only to providers that don't train on
  data. Set OpenRouter's provider `data_collection: "deny"` on every request, and use
  Google's paid tier, whose terms exclude training.

## Still worth a qualified review

1. **Louisiana consumer-protection rules** on non-refundable prepaid balances.
2. **Sales tax:** whether metered AI usage is taxable in Louisiana for this
   organization. Stripe Tax can compute it if so.
3. **Refunds late in the service life:** confirm with Stripe how long card
   refunds stay possible, so end-of-service refunds can be made.
4. **Age gate:** the app needs a signup age confirmation, and a purchase
   confirmation for under-18 users, to match these terms.
