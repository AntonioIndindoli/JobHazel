# Reminder emails

## Daily digest and scheduled interview mode

The redesign is implemented behind `NOTIFICATION_MODE`. The default remains `legacy` for a coordinated rollout. The notification cron stays **once daily at 15:07 UTC**. No additional background scheduler is required.

Set `NOTIFICATION_MODE=daily-digest-scheduled-interviews` after applying both new notification migrations. In this mode:

- One nonempty task digest is prepared per verified, opted-in user per nominal daily run. It includes up to 20 tasks, ordered due today, overdue, then upcoming, plus full section counts. Open overdue tasks can appear again on subsequent days. Date grouping follows the saved timezone, including DST.
- The digest explicitly shows its snapshot time. Quiet hours schedule that snapshot for the next allowed time before the following daily run; otherwise it is skipped. Later task completion does not rebuild the snapshot. Preference changes cancel deferred summaries.
- Interview create/update requests record durable synchronization work in the source transaction, then await a bounded provider attempt after commit. Future reminders within a seven-day send-time horizon are scheduled through Resend. The daily job fills the horizon and repairs outstanding work.
- Rescheduling cancels the previous provider email before creating a replacement. No-op/cosmetic edits do not resend an already-sent reminder for the same interview occurrence. Late-created interviews attempt a reminder promptly, but never after interview start. Quiet hours never move a reminder past interview start.
- Unsubscribe disables new scheduling immediately and attempts provider cancellation. A failed cancellation remains pending, with an honest user-facing warning. Account deletion clears personal payload data but leaves anonymous provider cancellation obligations until resolved.
- Provider acceptance is recorded as SCHEDULED, not SENT. Signed callbacks or provider retrieval distinguish sending, delivery, and failure.

### Configuration and capacity

Keep the existing Resend sender, public origins, CRON_SECRET and stable NOTIFICATION_UNSUBSCRIBE_SECRET. Add RESEND_WEBHOOK_SECRET from the configured Resend webhook. Its endpoint is **POST /notifications/webhook** and verifies the raw request body using Svix. Subscribe to email scheduled, sent, delivered, bounced, failed, suppressed, complained and delivery-delayed events. Event records store opaque IDs and outcomes, not raw recipient bodies.

NOTIFICATION_RUN_BUDGET_MS defaults to 45000 (maximum 240000). Configure the actual function duration with headroom beyond this budget. Each provider request times out after five seconds; workers reserve room for cancellation/retrieval. Discovery and provider work use bounded scans, persisted user/run cursors, and leases.

NOTIFICATION_COHORT_LIMIT defaults to 5, selected by ascending user ID among verified email opt-ins. Users beyond the cohort retain their preferences and see a capacity notice. Do not increase the limit until the workload fits a single invocation and the account's daily/monthly email quota. A full cohort with one digest each uses that many emails daily, plus interview reminders and unrelated account emails.

NOTIFICATION_PROVIDER_INTERVAL_MS defaults to 200. It adds spacing between operations; provider Retry-After is retained after HTTP 429. This is local pacing, not an account-wide distributed limiter. See [Resend usage limits](https://resend.com/docs/api-reference/rate-limit) and check the configured account's limits before rollout.

A run reports scheduled/reconciled/canceled counts, backlog, unknown and failed operations, excluded users, oldest pending age, and completion time. Incomplete or failed runs return 503. A persisted cursor avoids losing progress, but does not make a multi-day digest backlog acceptable. Shrink the rollout cohort if a run cannot drain. The job does not retry itself more frequently.

### Retry and cancellation rules

NotificationOperation is the durable revision/operation ledger; NotificationSync stores source-change work. Immutable provider creation parameters and first-attempt timestamps are persisted before network requests, with one key per operation. Creation retries stop after 23 hours to stay within the provider's 24-hour key window. UNKNOWN records without a provider ID are not automatically recreated; reconcile them in provider logs before any manual resend. A signed callback can recover an acknowledgement lost after acceptance.

Known provider IDs can be retrieved and canceled after that window. Cancellation is a desired state until the provider confirms it. If a source is deleted during an in-flight schedule, the returned ID is persisted and immediately canceled. If the process dies, the durable record/webhook supports later repair. Unknown acceptance during deletion can still require operator investigation.

Authenticated GET /notifications/status reports the current user's scheduling state. POST /notifications/retry attempts synchronization and pending operations, limited to five calls per user per 15 minutes in the database. Only confirmed creation rejection can produce a fresh interview operation on explicit retry; unknown acceptance and delivery failures are not reset. Network/provider outages can still cause missed or stale near-term reminders before the daily repair.

Terminal dedupe records for existing accounts remain. Anonymous resolved cancellation records and raw-free provider event receipts are removed after 30 days. Unresolved anonymous records remain for reconciliation. Application/interview deletion hooks preserve cancellation work; account deletion clears recipient payloads before the user relation is removed.

### Cutover and rollback

1. Apply the additive migrations and generate Prisma on an isolated branch first. Deploy the code with legacy mode while validating configuration. Existing opt-ins remain opt-ins; no user is automatically enabled.
2. Configure the verified sender, webhook endpoint/signing secret, cohort and function budget. Check provider quotas. Read the changed daily-summary behavior in Settings before rollout.
3. Switch to daily-digest-scheduled-interviews. The daily job refuses active legacy leases, cancels unattempted legacy work, and preserves attempted uncertain work as UNKNOWN. Legacy sent/unknown interview occurrences suppress duplicate new reminders.
4. Run an authorized-recipient smoke test for scheduling, cancellation, rescheduling, unsubscribe and delivery callbacks. Observe two daily runs and an interview delivered between them. Repository tests use fake senders and do not substitute for inbox testing.
5. To roll back, set **NOTIFICATION_MODE=drain**. Keep the daily job and webhook running until provider-held emails and unknown operations are resolved. New schedules/digests stop; cancellation continues. Legacy delivery refuses to start over unresolved attempted new operations. Disabling the worker cannot recall provider-held emails.

### Verification

Run backend/frontend/extension tests, frontend lint/build, and **npm run test:notifications:redesign** in backend with TEST_NOTIFICATION_DATABASE_URL and TEST_NOTIFICATION_DATABASE_HOST set to a disposable direct database endpoint. The integration script refuses the checked-in app environment's database hosts, uses synthetic accounts and a fake provider, and removes its test data. Apply migrations to that test branch before running it. Set NOTIFICATION_BENCHMARK_USERS (1–100) to include a synthetic daily-capacity check. Do not run this against production.

Verified in this workspace: 157 backend tests, 60 frontend tests, 15 extension tests, frontend lint/build, and isolated SQL integration. A five-user synthetic workload scheduled ten emails in 18.6 seconds without backlog; 25 users exceeded the 45-second budget. Live provider latency and quotas were not part of that benchmark. The isolated checks cover migration, concurrent discovery/claims, revision replacement, domain-service interview changes, digest uniqueness/expiry, deletion during provider acceptance, the retry-window boundary, and repeat daily execution. Unit tests also cover signed webhook replay/order, timezone boundaries and provider failures. Live provider configuration, quotas, inbox receipt and deployment remain separate release checks.

## Legacy mode reference

The following rules describe the retained legacy sender only. They do not apply to daily-digest-scheduled-interviews mode.

Settings → Notifications & reminders provides a master email opt-in, independent upcoming-task, overdue-task and interview switches, lead times, an IANA time zone, quiet hours, and an immediate unsubscribe button. Existing and new accounts start opted out. Only verified email addresses receive reminders. Account verification and recovery emails are independent.

## Delivery rules

- Upcoming tasks: once per task/deadline, within the configured 0–7 calendar-day lead time (default 1). Due-today tasks qualify until the end of their due day.
- Overdue tasks: once per task/deadline after the due day ends, including existing overdue tasks when enabling reminders. These are not daily nag emails.
- Interviews: once per scheduled time, within the configured 5–10,080 minute lead time (default 60). Only future `SCHEDULED` interviews qualify.
- Calendar dates and quiet hours use the preference time zone (default UTC); the settings screen can copy the device zone. Quiet hours include the start and exclude the end, support crossing midnight and DST, and require different endpoints. Held interviews are canceled if their start time passes. Held upcoming emails are canceled when they become overdue; the separate overdue category then applies.
- Completed/deleted tasks, canceled/deleted interviews, changed dates, unverified/changed recipient addresses and opted-out accounts are rechecked before sending. Rescheduling creates a new event. Returning to a previously used deadline does not resend that event.
- Preference changes reevaluate unattempted queued emails. Unsubscribing cancels pending/claimed deliveries; re-enabling does not replay canceled events. An email already accepted by the provider cannot be recalled.

## Configuration and deployment

1. Apply the committed Prisma migration with `prisma migrate deploy` using `DATABASE_URL_UNPOOLED`. The existing `vercel-build` script performs migration deployment and client generation.
2. Configure `RESEND_API_KEY`, a verified `EMAIL_FROM`, `APP_URL` (public frontend origin), `API_PUBLIC_URL` (public backend origin), `CRON_SECRET`, and a separate long random `NOTIFICATION_UNSUBSCRIBE_SECRET`. Use HTTPS public origins in production. The signing secret must remain stable for old unsubscribe links to work; rotating it invalidates them.
3. Deploy frontend and backend together. `backend/vercel.json` schedules `GET /notifications/maintenance/deliver` daily at 15:07 UTC (`7 15 * * *`) with `Authorization: Bearer <CRON_SECRET>`. Keep this endpoint accessible to the scheduler through any deployment protection rules. Scheduling starts only after deployment.
4. The checked-in daily schedule can delay task reminders and miss interview reminder windows entirely (the default interview lead time is 60 minutes). For timely reminders, change the notification cron to `*/5 * * * *` on a plan that supports it, or configure an external five-minute scheduler with the same bearer header and remove only the notification cron entry. Five-minute delivery is an optional deployment change, not the current configuration. Check [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) and [cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs) before changing the schedule.

Missing scheduler credentials fail closed. Missing email/signing configuration returns 503; delivery never treats a console log as a sent email. Each invocation processes up to 50 deliveries and stops starting deliveries after 45 seconds, including time spent on paginated discovery. Allow at least 60 seconds of function execution time. A backlog drains across subsequent runs; monitor scheduler results and increase worker capacity if needed. Discovery scans eligible users and their open dated tasks in pages of 100; if that scan approaches the function limit, move discovery to a separate durable worker before expanding volume.

## Idempotency and operations

`NotificationDelivery.dedupeKey` uniquely identifies user + category + resource + original due/scheduled timestamp. Concurrent discovery uses `createMany(skipDuplicates)`. Workers claim rows with an atomic conditional update and a two-minute lease, with a unique lease token fencing subsequent writes.

Before sending, the exact provider payload and first-attempt timestamp are persisted. Retries use the same payload and Resend `Idempotency-Key`, including after provider acceptance followed by a database acknowledgement failure. Transient errors back off from 1 minute to 60 minutes; retries are attempted only on a subsequent scheduler invocation. Permanent provider rejections become `FAILED`.

[Resend retains idempotency keys for 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys). Automatic retries stop after 23 hours from the first attempt and become `UNKNOWN`, preventing a delayed retry from sending a duplicate outside that window. With daily invocations, the next scheduled retry is already outside the 23-hour window and becomes `UNKNOWN`; use a more frequent scheduler for automatic retries. Reconcile `UNKNOWN` records against provider logs using `notification/<dedupeKey>` before considering any manual resend. A `SENT` status means provider acceptance, not confirmed inbox receipt. Terminal rows retain their dedupe keys; do not purge or reset them while the original event could qualify again. Persisted email bodies are cleared on terminal states.

The cron response contains counts for queued, sent, deferred (`pending`), canceled, skipped, retrying, failed, and unknown deliveries. A run with retrying/failed/unknown outcomes returns 503 for scheduler monitoring. Inspect `NotificationDelivery` for persistent failures and overdue pending records. Provider error bodies and recipient details are not logged.

## APIs and unsubscribe

- `GET /notifications/preferences`: authenticated preferences with defaults.
- `PATCH /notifications/preferences`: authenticated partial update, strict types and unknown-field rejection; ownership comes only from the access token.
- `POST /notifications/unsubscribe`: public, signed token supplied as JSON `{ "token": "..." }` or query string; repeatable. Tokens are limited to notification unsubscribe and bound to user ID plus current email.
- `GET /notifications/unsubscribe`: read-only instructions. It never changes preferences.
- `/unsubscribe?token=...` on the frontend: explicit confirmation without login. Merely opening or scanning the link does not unsubscribe.

Reminder emails contain the confirmation link, plain-text and escaped HTML content, plus `List-Unsubscribe` and RFC 8058 `List-Unsubscribe-Post` headers targeting the signed backend POST endpoint. Mail clients can unsubscribe in one click without authentication. Configure the sending domain's authentication through Resend so mailbox providers can honor these headers.

## Verification

`npm test` covers policy boundaries, DST, idempotent discovery, concurrent worker claims, provider failure and acknowledgement recovery, stale cancellation, preference validation, endpoint authentication, signed unsubscribe and provider headers. Frontend Vitest covers preference persistence, errors/retry, immediate unsubscribe, and explicit public confirmation.

For SQL integration, create a disposable branch, set `TEST_NOTIFICATION_DATABASE_URL` to its direct connection and `TEST_NOTIFICATION_DATABASE_HOST` to the matching hostname, then run `npm run test:notifications:integration` from `backend`. A gitignored `.env.notification-test` can supply these values. This command applies migrations to that branch, creates and removes a synthetic account, checks actual unique constraints/concurrent claims and retries, and injects a fake email sender. It refuses a database with already opted-in accounts. Never point it at production.
