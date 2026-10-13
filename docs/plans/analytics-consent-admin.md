# Analytics consent and administrator reporting

1. Show an account-level sharing prompt after authentication for email, Google, and Apple accounts without a saved choice. Preselect sharing, preserving a previous browser opt-out as the initial selection. Wait for the confirmed choice before collecting events.
2. Store the preference at `users/{uid}/settings/analytics`, protected by the existing owner-only Firestore rules. Synchronize changes through Firestore. Stop collection on logout, account changes, opt-out, and preference errors. Ignore stale asynchronous work from previous accounts.
3. Use the existing theme tokens for the welcome dialog, switch, Settings state, and report dashboard. Keep keyboard focus inside the dialog and support opting out with Escape.
4. Finish reporting configuration and administrator tooling. Keep Google credentials on the server, grant roles only through a trusted CLI, and verify both the token and current Firebase admin claim on every report request. Add reliable configuration checks, safe credential parsing, strict date filters, and bounded report requests.
5. Test consent races, account changes, revoked roles, report failures, and credential handling. Review the resulting backend and UI separately, run type checks, the full test suite, and a production build. Verify the live connection where credentials permit; document any external setup still required.
6. Commit only this work and push `user-analytics-admin-dashboard`. Preserve the existing unrelated PDF worker change.

## Separate review and verification

- Reviewed consent handling independently after implementation. Fixed failed-save rollback, stale account callbacks, and listener failures during opt-in. Collection stays off when these checks fail.
- Reviewed administrator authorization, server-only credentials, fixed report queries, date validation, private HTTP responses, bounded caching, concurrent requests, and rate limits. Writable profile fields never grant report access.
- Verified the deployed preference rules with authenticated requests: the account's own document returned 200; an unrelated account path returned 403. Live report requests returned 401 without authentication, 401 with an invalid token, and 403 without the admin claim.
- Verified the welcome dialog's default-on selection, saved opt-out, reload persistence, and absence of the Analytics script while opted out. Inspected the new controls in light, dark, and narrow-screen layouts using the existing theme.
- All 888 tests passed across 94 files. Type checking, focused ESLint checks for the new provider/backend code, and the production build passed. The build skips global lint by existing project configuration; the focused lint check was run separately.
- Granted the requested Catalyst administrator role and GA4 Viewer access with cost/revenue restrictions. The live reporting request passes application authorization but returns a safe 503 because Google Analytics Data API is disabled in the service account's Cloud project. The signed-in Google account and service account cannot enable that API. A project owner must enable it before live reports can load. The property timezone must then be confirmed against the first successful report.
- Local credentials remain in ignored environment files. Automated reporting tests use mocked Google responses; they do not establish successful live report retrieval.
