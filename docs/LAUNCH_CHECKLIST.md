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

## Paywall (built 2026-10-19, Stripe test mode)

Status: `BILLING_MODE=enforce` and `AI_BACKEND=testers` in `.env`. Only the accounts in
`AI_CLOUD_TESTERS` use cloud AI and pay for it; everyone else stays on free Ollama. A
container named `catalyst-stripe-listen` forwards Stripe test payments to the dev
server (`docker logs catalyst-stripe-listen`).

- [ ] **Test-buy as yourself:** open the site, accept the terms prompt, click **Add** next
      to AI credit in the sidebar, pay with card `4242 4242 4242 4242` (any future
      date, any CVC). Credit should appear within seconds. Then use some AI and check
      the history on the AI credit page.
- [ ] **OpenRouter auto top-up:** Billing settings → enable auto top-up, so the account
      never runs dry while students hold credit.
- [ ] **Stripe receipts:** Settings → Customer emails → Successful payments and Refunds.
- [ ] **Going live (when ready):**
  1. Finish Stripe activation, then Developers → Webhooks → add endpoint
     `https://catalyst.zonocsc.com/api/billing/webhook` with events
     `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `charge.refunded`, `charge.dispute.created`.
  2. Put the live `sk_live_`/`pk_live_` keys and that endpoint's `whsec_` secret in
     the server's `.env`, and stop the test forwarder (`docker rm -f catalyst-stripe-listen`).
  3. Set `AI_BACKEND=cloud` so every account uses cloud AI and the paywall.
- [ ] **Refund requests** (from contact@zonocsc.com): never refund from the Stripe dashboard.
      Run `npm run billing:refund -- student@email` to see the plan, then add `--yes`.
      It pauses the student's AI, refuses if a payment is disputed, refunds only unused
      credit and records it once. Deleting an account refunds automatically.
- [ ] After a few days of real use, ask Claude to run the usage report and compare it
      with the OpenRouter Activity page.
- [ ] Before you top up OpenRouter, check the report's "students are owed" total: keep
      OpenRouter's balance above it.

## Legal and organization

- [x] **Legal docs** in `docs/legal/` are published at `/legal/terms`, `/legal/privacy`
      and `/legal/credits`. Keep them in step with what the code does.
- [x] **`contact@zonocsc.com` inbox** is set up.
- [ ] **Louisiana sales tax:** ask an accountant whether metered AI usage is taxable
      for ZonoCSC. If it is, turn on Stripe Tax.
- [ ] **501(c)(3) (optional):** form a Louisiana nonprofit corporation (Secretary of
      State), then file IRS Form 1023-EZ (about $275). Until then the docs say
      "not-for-profit project", not "501(c)(3)".
- [ ] **Decide the real end date** if the service will run past March 18, 2027,
      and update the docs (an in-app notice goes out 30 days before).

## Monitoring and alerts

See `docs/INCIDENT_RESPONSE.md` for what each alert means.

- [ ] **Set `ALERT_EMAILS`** in the server's `.env` (comma-separated team addresses),
      then restart the container. Resend must be able to send from `RESEND_FROM_EMAIL`.
- [ ] **UptimeRobot** (free, uptimerobot.com): add an HTTP(s) monitor for
      `https://catalyst.zonocsc.com/api/health`, every 5 minutes, and add each
      teammate's email as an alert contact. Add a second monitor for
      `https://catalyst.zonocsc.com/` so a broken page shows up even when the API is fine.
- [ ] **Test the alerts** (steps in `docs/INCIDENT_RESPONSE.md` → "Testing the alerts").
- [ ] **Optional:** set the repository variable `HEALTH_URL` if the domain changes;
      the backup GitHub uptime check (`.github/workflows/uptime.yml`) uses it.

## Server

- [ ] **Node 22+ in production.** The project requires Node ≥ 22.19, and this machine
      has Node 20.19 (tests and benchmarks ran in a `node:22-slim` container).
      Check the production runtime matches.
