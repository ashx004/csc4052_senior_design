# Launch checklist: things only a person can do

Everything here needs an account login, a browser approval, money, or a
signature, so the code can't do it. Tick items off as you go. Engineering work
is tracked separately on branch `cloud_ai_billing`.

## Before any more testing

- [ ] **Rotate API keys** once benchmarking is done. They were printed in a session
      log on 2026-10-18. Regenerate the OpenRouter, Groq and Google AI keys, then
      update `.env`.
- [ ] **Delete `memories-20261018153157.zip`** from the repo folder once you no longer
      need it. It's gitignored, but it holds personal notebook photos.

## Firebase

- [ ] **Deploy the Firestore rules** after reviewing `firestore.rules`. The wallet lock
      and the `courseOfferingCache` fix only take effect once deployed:
      `firebase deploy --only firestore:rules`. Alternatively, install and log in
      the Firebase CLI on the server (`firebase login`) and Claude can run it.

## Stripe (dashboard.stripe.com)

- [ ] **Stripe CLI login** for local webhook testing. Run once and approve in the browser:
      `docker run --rm -it -v ~/.config/stripe:/root/.config/stripe stripe/stripe-cli login`
- [ ] **Receipts:** Settings → Customer emails → turn on **Successful payments**
      (and **Refunds**).
- [ ] **Statement descriptor:** Settings → Public details, e.g. `ZONOCSC CATALYST`, so
      students recognize the charge and don't dispute it.
- [ ] **Support details:** Settings → Public details → support email
      `contact@zonocsc.com` and the website URL.
- [ ] **Before going live:** activate the account with ZonoCSC's legal details and
      bank account. Add the production webhook endpoint
      `https://<your domain>/api/billing/webhook` (event `checkout.session.completed`
      and `charge.refunded`). Put its signing secret in `STRIPE_WEBHOOK_SECRET` on the
      server. Only then swap the `sk_test_`/`pk_test_` keys for live ones.

## AI providers

- [x] **OpenRouter privacy:** Settings → Privacy, providers that may train on inputs
      disabled (done 2026-10-18).
- [ ] **OpenRouter:**
  - keep credits topped up; this is the money students' usage draws from
  - set a monthly key limit as a safety net
  - **create a separate key used only by the site** (e.g. "catalyst-prod"). The dry-run
    report compares logged cost with the key's usage, and the current key also
    carries the benchmark spend.
- [x] **Google AI Studio billing enabled** (done 2026-10-18).
- [ ] **Google AI Studio credits:** Gemini is prepaid. With $0 credit it answers
      "prepayment credits are depleted" (checked 2026-10-18), so the backup model
      can't step in when OpenRouter is down. $5 covers years of backup use.

## Billing dry run (log-only metering, in code since 2026-10-18)

- [ ] On the server, set `AI_BACKEND=cloud`, the `AI_MODEL_*` lines from `env.example`,
      and `BILLING_MODE=log`, then restart.
- [ ] Use the site normally for a few days: chat, quizzes, flashcards, an OCR upload,
      advising.
- [ ] Run `npm run billing:report -- --resolve` and compare **"openrouter <day>"** with
      the OpenRouter Activity page for the same UTC day. They should agree to within
      a cent.
- [ ] Check the **Unattributed** section is empty. Anything there is a feature that
      would not be charged to anyone.
- [ ] Tell Claude the result. Then Stripe Checkout gets built and charging turns on.

## Legal and organization

- [ ] **Read the legal docs** in `docs/legal/`, ideally with someone who has legal
      experience. They are written as final but have not been reviewed. Points worth
      a reviewer's eye are listed in `docs/legal/README.md`.
- [ ] **Set up the `contact@zonocsc.com` inbox.** The docs promise refunds and privacy
      requests there.
- [ ] **Louisiana sales tax:** ask an accountant whether metered AI usage is taxable
      for ZonoCSC. If it is, turn on Stripe Tax.
- [ ] **501(c)(3) (optional):** form a Louisiana nonprofit corporation (Secretary of
      State), then file IRS Form 1023-EZ (about $275). Until then the docs say
      "not-for-profit project", not "501(c)(3)".
- [ ] **Decide the real end date** if the service will run past March 18, 2027,
      and update the docs (an in-app notice goes out 30 days before).

## Server

- [ ] **Node 22+ in production.** The project requires Node ≥ 22.19, and this machine
      has Node 20.19 (tests and benchmarks ran in a `node:22-slim` container).
      Check the production runtime matches.
