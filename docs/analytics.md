# Catalyst usage analytics

## Scope and data flow

Consented browser actions → Firebase Analytics / GA4 → server-side Google Analytics Data API → `/admin/analytics`.

After signing in, accounts without a saved choice see a welcome dialog. **Share usage analytics** is selected by default; collection starts only after the user saves that choice. **Don’t share** (or Escape) saves an opt-out. This covers email, Google, and Apple signup, including social accounts first created from the login page. Existing accounts without a saved choice also see this dialog. A legacy browser opt-out preselects the switch off; legacy opt-in never silently enables account collection.

Preferences are stored in `users/{uid}/settings/analytics` as `enabled` and `updatedAt`. The existing Firestore owner-only rule protects this document. The preference synchronizes across connected tabs/devices and is available in Settings. No account UID is included in analytics event payloads. Collection stays off while the preference is loading, before a confirmed write, after logout/account changes, and when reading or saving fails. Cached opt-ins alone do not enable collection. Withdrawing consent stops future events; already transmitted events cannot be recalled or deleted by this setting. Offline devices need a connection to receive changes; configure GA4 retention separately.

The initial workflow instrumentation covers course quiz practice, the shared course/chat resource upload service (including individual OCR page uploads), and study sessions. Upload success means file storage succeeded; it does not mean metadata, OCR, or indexing succeeded. Upload validation that rejects a file before transmission is not a storage attempt. Notes uploads using the shared service are included; separate advising upload pipelines are outside these resource-upload counts.

## Collection setup

1. In the existing Firebase project, enable/link Google Analytics and verify the production web app and GA4 web stream.
2. **Before enabling collection, turn OFF all Enhanced Measurement features for each analytics web stream**, including history/page changes, outbound clicks, downloads, forms, search, scrolling, and video. Disable Google Signals, user-provided data collection, and any independently installed GA/GTM tag for this app. Otherwise those mechanisms can send extra events or raw URLs outside this code's allowlist.
3. Create a separate non-production GA4 property and associate it with a separate Firebase project/web app for development. Do not point local builds at the production property. Set the test Firebase API key and project ID below to the test project. The test measurement ID and app ID must belong to the same registered app. GA4 property linkage is project-level, so another web app in the production Firebase project alone is not sufficient isolation.
4. Fill in the collection environment variables in `env.example`. `NEXT_PUBLIC_*` values are compiled into the browser bundle; rebuild after changing them.
5. Set `NEXT_PUBLIC_ANALYTICS_CONFIGURED=true` only after completing the preceding stream configuration. This is an operator assertion, not an automatic inspection of GA settings.
6. Development events use `debug_mode`; opt in from Settings and verify the test property's DebugView.

A dedicated named Firebase app initializes Analytics without altering the primary authentication/Firestore app. Production collection uses the configured production measurement/app IDs. Non-production collection requires explicit test IDs and test Firebase configuration. Missing configuration disables collection safely.

Automatic initial page views are disabled. The root tracker sends one manual page view per pathname visit; URL query-only changes do not count as navigation. Dynamic IDs become route templates and unknown paths become `/other`. Configuration and manual events override page location/title/referrer with safe values. Enhanced Measurement must remain disabled because remotely configured collection can bypass application sanitization.

## Events and reporting dimensions

The typed and runtime-validated contract is `src/library/analyticsContract.ts`:

- `page_view`: `page_name` (normalized path).
- `page_load`: `page_name`, `load_time_ms`, `navigation_type`, `metric_version`.
- `quiz_started`: `quiz_type`, `question_count`.
- `quiz_completed`: those properties plus `duration_seconds`.
- `resource_upload_started`, `resource_upload_succeeded`: `file_type`, `entry_point`.
- `resource_upload_failed`: those properties plus `error_category`.
- `study_session_started`: `task_type`.
- `study_session_completed`: `task_type`, `duration_seconds`.

Quiz and study durations are seconds. `page_load.load_time_ms` is milliseconds from the browser's completed Navigation Timing record (with legacy browser timing only as a fallback); it is sent once for the initial document navigation and is omitted when no valid browser timing is available. Quiz durations are elapsed attempt time; study durations exclude pauses. GA supplies timestamps. Local deduplication identifiers are never sent; deduplication is bounded to the current tab's memory. Browser closure, blockers, offline operation, and consent changes mean counts are best-effort rather than an audit ledger. Events are not persisted or replayed after opt-in.

The dashboard queries built-in `eventName`, `pageTitle`, and `date` with `eventCount`; `pageTitle` contains the normalized route. Its page-load performance table additionally requires `load_time_ms` to be registered as an event-scoped custom metric with milliseconds units. Register `quiz_type`, `file_type`, `entry_point`, `task_type`, `navigation_type`, and `metric_version` as event-scoped custom dimensions when analyzing those properties in GA. Newly registered custom dimensions and metrics are not retroactive. GA4 supplies a count and average for custom metrics, but not percentile values; p50/p75/p95 reporting requires a raw-event warehouse. Do not add user IDs, raw errors, names, content, or arbitrary strings to the contract.

## Reporting setup

1. Enable the **Google Analytics Data API** in the service account's Google Cloud project.
2. Create/use a dedicated reporting service account and grant its email **Viewer** access under the target GA4 property's access management. Firebase IAM permission alone does not grant GA4 report access.
3. Configure `GA4_PROPERTY_ID` for production and `GA4_TEST_PROPERTY_ID` for local/development reporting with the **numeric** property ID, not the `G-...` measurement ID. Non-production reporting never falls back to the production property.
4. Set `GA4_PROPERTY_TIMEZONE` to the exact property timezone (for example `America/Chicago`). Reports reject a timezone mismatch. Presets are resolved on the server in this timezone and include today.
5. Set `GA4_CLIENT_EMAIL` and `GA4_PRIVATE_KEY` only in the server environment. Literal `\n` in the key is supported. Do not commit credentials.
6. Run `npm run analytics:check` to verify credentials, API access, property permissions, and the report timezone. This loads `.env.local`, then missing values from `.env`; existing shell variables take precedence. Set `NODE_ENV=production` explicitly to verify the production property.
7. Grant the intended Catalyst account the admin claim, restart the app, and sign out/back in. Open the **Analytics** sidebar link or `/admin/analytics`. The dashboard shows page views, feature activity, daily activity, and workflow starts/outcomes with date filters. GA4 standard reports may take time to include fresh DebugView events.

Reporting accepts only a date range, capped at 366 inclusive days. Queries are fixed to approved events. Results are cached for 60 seconds in server memory, with bounded entries. Identical concurrent requests share one Google request; at most 10 distinct reports can be in flight. Each admin can request 30 reports per minute using the project’s existing process-local limiter. Multiple server instances would need a shared limiter. Every request verifies current administrator access before accessing this cache. HTTP responses are private/no-store. Report retrieval time is not event freshness. Standard reports can take time to process; thresholds, sampling, and row limits are identified in the UI. Compare using identical date ranges, property timezone, and event filters.

The dashboard shows aggregate event counts and page-load sample counts/averages, not unique people or matched conversion funnels. A completion can belong to an earlier period's start. No raw event browser or session replay is provided.

## Grant or revoke administrator access

Use an existing Firebase account. From a trusted machine with Firebase Admin credentials in `.env.local` or `.env`:

```sh
npm run admin:access -- status FIREBASE_UID
npm run admin:access -- grant FIREBASE_UID
npm run admin:access -- revoke FIREBASE_UID
```

The script preserves unrelated claims. After a grant, sign out and sign back in to obtain the new claim. Revocation removes the claim and revokes the user's existing Firebase sessions. Each protected request checks both a revocation-verified ID token and current account claims, so an old admin token does not preserve report access. Only navigation visibility uses client claims. No browser-accessible role-management endpoint exists.

The authenticated admin page redirects logged-out visitors to login, renders an access-denied state for non-admin users, and avoids fetching reports for them. The API returns 401 for invalid sessions and 403 for non-admin or revoked roles.

## Verification checklist

- Run `npm run typecheck`, `npm test`, and `npm run build`.
- With a new account, verify the sharing switch is initially on but no Analytics script initializes before saving. Repeat with Google/Apple signup, opt-out, reload, logout/account switching, and another tab. Verify an opt-out remains saved and another account cannot change it.
- With test configuration and opt-in, navigate including dynamic routes; verify sanitized URLs/titles/referrers in browser network requests and DebugView. On an initial document visit, verify one `page_load` event with a normalized `page_name`, `load_time_ms`, navigation type, and `navigation_timing_v1` metric version.
- Start/complete a quiz and study session; upload a resource and OCR page; verify one start and corresponding outcome. A quiz result view is not a new attempt. Indexing failure must not change storage-success counts.
- Toggle consent off during loading, after tracking, and in another tab; verify no subsequent collection. Inspect SDK-generated events as well as application events.
- Compare dashboard and GA4 counts using the same dates and approved event filters, allowing processing time.
- Test logged-out, regular-user, administrator, and revoked-administrator access, including direct API calls after the report cache has been populated. A writable profile `role` field does not grant admin access; only Firebase Auth custom claims do.
- Test missing configuration, empty periods, invalid dates, and unavailable reporting.

Live Google configuration changes, role grants, deployments, DebugView checks, and production comparisons must be performed by an authorized operator. Local automated tests mock Google/Firebase; they do not establish that live credentials or property permissions are correct.


## Admin dashboard and user counts

The dashboard includes the overview, event search, CSV export, and a separate service-health view. It uses the existing Catalyst theme, sidebar, and authentication.

- **Active users:** GA4's distinct `activeUsers` for the selected date range. Daily distinct counts are never added to calculate this total.
- **Concurrent users:** GA4 realtime `activeUsers` for minutes 4 through 0 (the last five minutes). This is an activity estimate, not a count of connected browsers. Only activity received by GA4 is included.
- **Peak concurrent users:** highest five-minute count sampled since monitoring began, across all observed dates. Sampling can miss short spikes.
- **Peak daily users:** highest daily active-user count observed from historical reports. GA4 can revise processed data, so this is an observed high-water mark rather than a permanently final count. The daily documents hold the latest retrieved counts.
- Realtime and historical reports are independently cached for one minute. Historical dates use `GA4_PROPERTY_TIMEZONE`; realtime sample timestamps use UTC. The browser displays timestamps in the viewer's local timezone.

GA4 requests use five batch slots: pages, approved events, daily activity (including page views), distinct users, and daily users. Realtime uses a separate `runRealtimeReport` call. Existing GA4 Viewer access and the Data API are sufficient; no extra Google role is needed. See [GA4 realtime metrics](https://developers.google.com/analytics/devguides/reporting/data/v1/realtime-api-schema).

## Continuous monitoring on the host

Run **one monitoring worker per deployment** using the same server environment as the website:

```sh
NODE_ENV=production npm run worker:monitor
```

Keep it running with the host's process manager and restart it on deployment. No new secret or browser environment variable is required. The worker uses existing Firebase Admin, GA4, GCS, Qdrant, and AI configuration. Development must use the existing test GA4 configuration; production must use production IDs. Services are checked from the machine running the worker, so run it on the host that serves Catalyst.

The Docker image also includes the worker. Run a second container from the same deployed image, with the same server environment / `.env` mount and network access, using this command:

```sh
node --conditions=react-server workers/monitorWorker.cjs
```

The worker samples realtime users and health every minute and refreshes seven days of daily counts every 15 minutes to pick up processing delays. Starting it does not grant admin roles, change consent, or generate paid AI completions. The dashboard also samples when an admin opens it; without the worker, there are gaps whenever the page is closed. A missing or stale heartbeat is shown in Service health.

## Service checks and interruption history

`GET /api/admin/health` and `GET /api/admin/analytics/realtime` require the same current Firebase admin claim as the report endpoint. Authentication and revocation checks run before reading caches or probing. Responses are private/no-store and requests are rate-limited per admin.

- **AI models:** verifies configured cloud model catalogs and credentials, plus required Ollama model availability. Secondary embeddings are checked even in cloud mode. A catalog check cannot prove that a paid generation will succeed; real request failures, timeouts, stream errors, and generation slower than 30 seconds are recorded separately. Existing low-throughput Ollama warnings also reach this log.
- **Vector database:** checks Qdrant `/readyz`, including configured fallback addresses.
- **File storage:** checks a bounded object listing under a dedicated probe prefix without downloading student files. This uses the same object-list permission as the app; it does not require bucket-metadata administration permissions. Actual storage helper failures also record a warning.
- **Firestore:** reads a dedicated monitoring document; it does not read student records. If Firestore itself is down, current probes still render, with an explicit history-unavailable notice.

Probes use bounded deadlines. Missing configuration is distinct from an outage; slow successful checks or fallback connections are degraded. Probes only use server-configured destinations, never URLs from request parameters. Redirects are rejected on credentialed HTTP checks. SDK deadlines bound dashboard waiting; SDK operations may finish in the background because their APIs do not expose cancellation for these reads.

State changes are saved transactionally in `adminServiceStatus` and `adminIncidents`. Repeated unhealthy samples extend the same open incident; a healthy sample closes it. Duration is the time between observations, not exact downtime. A whole-site/host outage cannot be observed by a worker on that same host; use an external uptime monitor for that. No fabricated uptime percentage is shown.

Request warnings are deduplicated per service/type/minute and contain fixed messages only: no URLs, credentials, UIDs, prompts, documents, or upstream response bodies. User-requested cancellations are not counted as service failures. These warnings do not mark every request or model as down.

`adminAnalyticsPeaks/{propertyId}` stores peaks, daily counts, and minute samples. All monitoring collections deny direct client reads/writes, including for admins; only the authenticated server endpoints serve them. The worker deletes expired realtime samples and closed/request incidents in bounded batches after 30 days. Open incidents and aggregate peak/daily records remain. Deploy `firestore.rules` with the application; the existing default-deny rule also protects these new collections.

## Validation

Automated tests cover distinct and empty user counts, realtime API failures, concurrent peak updates, service failures and recovery, missing configuration, slow/failed streams, user cancellations, denied admin endpoints, private responses, and dashboard empty/error states. Local tests use mocked services. Before production rollout, run the worker on the host, confirm its heartbeat, compare a sample against GA4, and exercise the deployed dashboard with an admin account. Do not deliberately interrupt production services to test failure handling.

## HTML or gateway errors on admin reports

A report endpoint must return JSON. A Cloudflare HTML page with HTTP 502 means
that the request failed between the gateway and the application host; it is not
an empty GA4 report. The dashboard retries non-JSON 502/503/504 responses once,
then shows the HTTP status instead of a JSON parser error. Authentication errors,
rate limits, and JSON application errors are not retried immediately.

When this happens, capture the request path, UTC timestamp, status, and Cloudflare
Ray ID. The host operator should correlate those with the application container,
reverse proxy or tunnel, and deployment logs. Check for container restarts or
out-of-memory exits, failed upstream connections, and a deployment that briefly
routes to an unavailable instance. Compare the same endpoint through the public
URL and the application's local listening address. A signed-out JSON 401 is an
expected authentication response, not proof that signed-in reporting works.

After the host problem is corrected, verify the signed-in dashboard through the
public URL. Changing GA4 credentials or suppressing the error does not repair a
failing gateway. Do not include session cookies, private keys, or full environment
files when sharing diagnostics.
