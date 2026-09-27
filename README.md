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
`FIREBASE_ADMIN_PRIVATE_KEY`, and a long random `CRON_SECRET` in the production
environment. `vercel.json` invokes `/api/email/reminder` every five minutes;
Vercel sends `Authorization: Bearer $CRON_SECRET` for this request when that
environment variable is configured. Deploy the Firestore indexes with
`firebase deploy --only firestore:indexes` before enabling the cron.
