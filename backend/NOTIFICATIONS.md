# Reminder emails

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
3. Deploy frontend and backend together. `backend/vercel.json` schedules `GET /notifications/maintenance/deliver` every five minutes with `Authorization: Bearer <CRON_SECRET>`. Keep this endpoint accessible to the scheduler through any deployment protection rules. Scheduling starts only after deployment.
4. Use a Vercel plan supporting five-minute cron frequency, or configure an external five-minute scheduler with the same bearer header and remove only this notification cron entry. Hobby's daily-only schedule cannot provide timely interview reminders. See [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) and [cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

Missing scheduler credentials fail closed. Missing email/signing configuration returns 503; delivery never treats a console log as a sent email. Each invocation processes up to 50 deliveries and stops starting deliveries after 45 seconds, including time spent on paginated discovery. Allow at least 60 seconds of function execution time. A backlog drains across subsequent runs; monitor scheduler results and increase worker capacity if needed. Discovery scans eligible users and their open dated tasks in pages of 100; if that scan approaches the function limit, move discovery to a separate durable worker before expanding volume.

## Idempotency and operations

`NotificationDelivery.dedupeKey` uniquely identifies user + category + resource + original due/scheduled timestamp. Concurrent discovery uses `createMany(skipDuplicates)`. Workers claim rows with an atomic conditional update and a two-minute lease, with a unique lease token fencing subsequent writes.

Before sending, the exact provider payload and first-attempt timestamp are persisted. Retries use the same payload and Resend `Idempotency-Key`, including after provider acceptance followed by a database acknowledgement failure. Transient errors back off from 1 minute to 60 minutes. Permanent provider rejections become `FAILED`.

[Resend retains idempotency keys for 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys). Automatic retries stop after 23 hours from the first attempt and become `UNKNOWN`, preventing a delayed retry from sending a duplicate outside that window. Reconcile `UNKNOWN` records against provider logs using `notification/<dedupeKey>` before considering any manual resend. A `SENT` status means provider acceptance, not confirmed inbox receipt. Terminal rows retain their dedupe keys; do not purge or reset them while the original event could qualify again. Persisted email bodies are cleared on terminal states.

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
