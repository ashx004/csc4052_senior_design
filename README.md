<h1><picture><source media="(prefers-color-scheme: dark)" srcset="public/app-logo-dark.svg"><img src="public/app-logo.svg" alt="Catalyst logo" height="36"></picture> Catalyst</h1>

Catalyst is a study companion for college students. It brings each course's syllabus, key dates, notes and uploaded materials into one place, and uses AI to turn those materials into flashcards, quizzes and study plans, answer questions about them, and help with degree advising, so students spend less time organizing and more time learning.

# To run: 

Requires Node.js >= 22.19.0 (see `engines` in `package.json`) and npm >= 11.

1.) Clone the repository: 
* ssh: `git clone git@github.com:ashx004/csc4052_senior_design.git`
* https: `git clone https://github.com/ashx004/csc4052_senior_design`

2.) Navigate to the directory

3.) Install dependencies with `npm ci` at the root of the project directory (`csc4052_senior_design/`).
This installs the exact versions recorded in `package-lock.json`. Use `npm install` only when
intentionally adding or upgrading a dependency.

4.) Create a `.env.local` file (copy `env.example`) and set `NEXT_PUBLIC_FIREBASE_API_KEY` (and any other required env vars like `GCS_*`). Keep this file out of version control.

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

## Usage analytics and administrator dashboard

See [docs/analytics.md](docs/analytics.md) for opt-in tracking, isolated test collection, GA4 reporting setup, and granting/revoking administrator access. The dashboard is available at `/admin/analytics` after configuration.

## Production deploys

Pushing to `main` runs `.github/workflows/deploy-image.yml`, which builds the
`Dockerfile` on GitHub's runners and pushes `ghcr.io/ashx004/csc4052_senior_design`.
The server only pulls that image (its `deploy-watch.sh` checks every 3 minutes,
health-checks the new version and rolls back if it fails) - it never runs
`npm install` or `next build` itself.

- `NEXT_PUBLIC_*` values are baked into the browser bundle at build time. Keep
  them, one `KEY=value` per line, in the `NEXT_PUBLIC_ENV` repository secret.
- Server-only secrets stay in the server's `.env`, mounted into the container
  at runtime. If a module needs a value just to be imported during the build,
  add a dummy for it to `docker/build-placeholders.env`.

## Phone apps

- **iPhone:** open the site in Safari → Share → **Add to Home Screen**. It runs full-screen with its own icon (`src/app/manifest.ts`, `public/sw.js`).
- **Android:** Chrome offers **Install app** the same way, or download the APK from GitHub Releases.

The APK is the live site in Chrome, full-screen (a Trusted Web Activity built with Bubblewrap from `android/twa-manifest.json`), so site deploys reach it without a new APK. A new APK is only needed when the icon, name or Android settings change. To release one:

```bash
git tag app-v1.2.0 && git push origin app-v1.2.0
```

`.github/workflows/release-apk.yml` builds and signs it and publishes the GitHub Release. It needs the `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS` repository secrets, and the key's SHA-256 fingerprint must match `public/.well-known/assetlinks.json` (the workflow checks). **Never lose the keystore:** installed apps can only be updated with the same key.

Open tabs and installed apps check `/api/app-version`. They offer a refresh after a new deploy, and inside the Android app, a download when a newer APK is released.


### Admin analytics and service monitoring

Administrators can view user counts, peak activity, event reports, service checks,
and interruption history at `/admin/analytics`. Run one continuous monitoring
worker alongside the site with `NODE_ENV=production npm run worker:monitor`.
The Docker worker command is `node --conditions=react-server workers/monitorWorker.cjs`.
It uses the existing server environment. See [analytics setup and monitoring](docs/analytics.md)
for definitions, retention, and deployment checks.
