# Playwright E2E tests

Run the full suite locally with Firebase Emulator Suite. It never contacts the production Firebase project (`studora-933f8`) and creates fresh Auth/Firestore fixtures for every run.

## Local run

1. Install Java 21 or newer (Firestore Emulator requires it): `java -version`.
2. Install packages and Chromium once: `npm install` then `npx playwright install chromium`.
3. Download the Firestore emulator once: `npx firebase-tools setup:emulators:firestore`.
4. Run the suite: `npm run e2e:local`.

The runner starts Auth and Firestore emulators, seeds a student and administrator, builds and starts Next on port 3100, signs each browser into the correct emulator account, and runs Playwright. The build makes deep route coverage reliable by avoiding Next dev's on-demand chunk eviction; it can make the first run take longer. It stops the emulators afterward.

To run one project or show a browser:

```bash
E2E_TEST_ARGS="--project=student" npm run e2e:local
E2E_TEST_ARGS="--headed" npm run e2e:local
```

## Remote run

`npm run e2e` remains available for an explicitly provisioned non-production Firebase project. Set `E2E_TEST_MODE=true`, `E2E_PROJECT_ID`, `E2E_FIXTURE_MANIFEST`, `E2E_STUDENT_STORAGE_STATE`, and `E2E_ADMIN_STORAGE_STATE` first. Never use production.

Never commit `.runtime` files, credentials, access tokens, Playwright reports, or test results. See `.specs/playwright-e2e-site-coverage.md` for fixture isolation, external-service stubs, failure cataloging, and CI requirements.
