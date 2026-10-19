# Legal documents

The published terms, privacy policy and credit policy (served at `/legal/*`).
They describe what the code does, so update them when behavior changes.

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
- AI providers: OpenRouter, Inc. (processor, under its non-negotiable Data
  Processing Agreement) and the model hosts it routes to (its subprocessors),
  with Google Gemini API as the backup. Embeddings stay on ZonoCSC-operated
  servers, reached directly, over Tailscale, or through the Cloudflare tunnel
  (Cloudflare listed because it decrypts tunnel traffic; Tailscale doesn't).
  Update the privacy policy's table if this changes.
- **Engineering must make true:**
  - requests go only to providers that don't train on data: OpenRouter
    `provider.data_collection: "deny"` on every request, and Google's paid tier
  - no surname or email in AI prompts: only first name and school
    (`promptIdentity` in `src/library/systemPrompt.ts`)
