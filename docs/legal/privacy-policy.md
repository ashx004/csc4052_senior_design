# Privacy Policy

_Effective October 18, 2026. Last updated October 19, 2026._

## What we collect

- **Account:** email address, name, and sign-in method (email, Google or Apple),
  through Firebase Authentication.
- **Your study data:** classes, notes, uploaded documents and images, study sets,
  quiz results, calendar entries, chat history, and advising inputs such as
  transcripts.
- **Search index:** text from your documents is split into pieces and stored as
  numeric vectors, so the AI can find relevant passages.
- **Billing:** your credit balance and a log of each AI charge (feature, tokens,
  cost, time). Card details go directly to Stripe and never reach our servers. We
  keep Stripe's payment references and amounts.
- **Usage analytics, only if you opt in:** anonymous page-view and feature events
  with no account ID. You can turn this off in Settings at any time.

## Who processes your data

| Service | Why | What it receives |
|---|---|---|
| OpenRouter, Inc. | Routing each AI request you start to a model host | The prompt for that request: your message and the relevant parts of your notes or documents, or the image for OCR |
| Model hosts selected by OpenRouter (its subprocessors) | Running the AI model for that request | The same prompt, passed on by OpenRouter |
| Google (Gemini API) | Backup AI provider, used only if OpenRouter is unavailable | The same prompt |
| ZonoCSC-operated servers | Building the document search index (embeddings) | Text from documents you upload, and your chat question |
| Cloudflare | Secure network tunnel to ZonoCSC-operated servers | Traffic to those servers when the direct connection is unavailable |
| Google Cloud / Firebase | Hosting, sign-in, database, file storage | Everything above |
| Stripe | Payments and receipts | Email, payment details, amount |
| Resend | Reminder and notice emails | Email address, message content |
| Google Calendar (if you connect it) | Syncing events | Calendar events you choose to sync |

**AI providers and training.** OpenRouter processes AI requests under its Data
Processing Agreement and passes each one to a model host acting as its
subprocessor. OpenRouter publishes its current list of model hosts and their
data policies. We configure every request to go only to hosts that **do not
train on your data** and keep it for the shortest time available. AI requests
carry only the content needed for that request, plus your first name and school
so the assistant can address you. We never send your full name or email
address.

If you use **your own API key (BYOK)**, the requests go to that provider under
your own agreement with them.

## How long we keep it

We keep your data while your account exists. When you delete your account, we
delete your study data, files and vectors. We keep payment records as long as
the law requires. At **end of service** we delete account data within 60 days,
as described in **AI Credits, Refunds and End of Service**.

## Your choices

- **Export:** download your data from Settings at any time.
- **Delete:** delete your account from Settings. Any unused balance is refunded first (minus the payment processing fee).
- **Analytics:** opt in or out in Settings.
- **Questions or requests:** contact@zonocsc.com.

We do not sell your personal information or use it for advertising.

## Children

Catalyst is not for children under 13. We do not knowingly collect personal
information from anyone under 13. If you believe a child under 13 has an
account, contact contact@zonocsc.com and we will delete it.
