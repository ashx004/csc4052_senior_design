# csc4052_senior_design

# To run: 

Requires Node.js >= 22.19.0 (see `engines` in `package.json`) and npm >= 11.

1.) Clone the repository: 
* ssh: `git clone git@github.com:ashx004/csc4052_senior_design.git`
* https: `git clone https://github.com/ashx004/csc4052_senior_design`

2.) Navigate to the directory

3.) Install dependencies with `npm ci` at the root of the project directory (`csc4052_senior_design/`).
This installs the exact versions recorded in `package-lock.json`. Use `npm install` only when
intentionally adding or upgrading a dependency.

4.) Create a `.env.local` file (copy `env.example`) and set `NEXT_PUBLIC_FIREBASE_API_KEY` (and any other required env vars like `MINIO_*`). Keep this file out of version control.

5.) Run `npm run dev` at the root of the project directory

6.) Navigate to localhost at the port exposed in the output window (typically 3000)

For durable OCR and document-indexing jobs, run `npm run worker:ocr` as a
separate managed process. Set `OCR_WORKER_URL` to the deployed
`/api/document-jobs/worker` endpoint and provide the same `INTERNAL_API_SECRET`
used by the web application.

## Email reminder deployment

Email reminders use a server-only Firebase Admin SDK worker and Resend. Set
`RESEND_EMAIL_PRIVATE_KEY`, `RESEND_FROM_EMAIL`, `APP_BASE_URL`,
`FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`,
`FIREBASE_ADMIN_PRIVATE_KEY`, and `INTERNAL_API_SECRET` in the production
environment. Run `npm run worker:reminders` as a separate managed process next
to the web app. Set `REMINDER_WORKER_URL` to the self-hosted
`/api/email/reminder` endpoint (normally `http://127.0.0.1:3000/api/email/reminder`)
and optionally set `REMINDER_WORKER_POLL_MS` (defaults to 60 seconds). The
worker authenticates with the same `INTERNAL_API_SECRET` as the OCR worker.
Deploy the Firestore indexes with `firebase deploy --only firestore:indexes`
before starting the reminder worker.

## Email login 2FA

Email/password accounts must complete an eight-digit, single-use email code
before the browser receives a Firebase session. Set `AUTH_EMAIL_OTP_SECRET` to
a separate random value of at least 32 characters. The default code lifetime is
10 minutes, with five verification attempts, a 60-second resend cooldown, and
three total sends; the corresponding `AUTH_EMAIL_OTP_*` variables in
`env.example` can adjust those values.

To test safely after configuring Resend, use a Firebase user whose email is
verified: sign out, enter that account's email/password, and enter the code
delivered from the verified Resend sender. Confirm the user cannot reach the
dashboard before code verification, that a wrong code is rejected, and that a
correct code works only once. Google and Apple continue to use their identity
provider's own sign-in/MFA flow; this email-code gate applies to email/password
login only.

For durable advising extraction jobs (transcript + curriculum parsing), run
`npm run worker:advising` as a separate managed process. Set
`ADVISING_WORKER_URL` to the deployed `/api/advising-jobs/worker` endpoint and
provide the same `INTERNAL_API_SECRET` used by the web application.
