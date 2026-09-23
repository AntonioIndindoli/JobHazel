# Daily task digest and scheduled interview reminders

Status: implementation completed in the workspace; production activation and live-email verification remain release steps.

## Implementation verification

- Backend: 157 tests passed. Frontend: 60 tests passed; lint and production build passed. Extension: 15 tests and development build/typecheck passed.
- Both notification migrations applied successfully to an isolated development-database branch. SQL integration passed for concurrent revision discovery and claims, cancellation-before-replacement, daily digest uniqueness/expiry, actual interview service hooks, deletion during provider acceptance, retry-window expiry, and duplicate daily runs. The provider was a fake; no emails were sent.
- Capacity: a five-user synthetic cohort with one digest and one new interview reminder per user scheduled all ten emails in 18.6 seconds with no backlog. A 25-user cohort exceeded the 45-second processing budget. The default rollout cap is therefore five verified opt-in users, configurable after deployment-specific capacity testing. These timings include real database round trips, but not live Resend latency or quotas.
- Implementation uses NotificationOperation as the new revision/delivery/operation ledger, preserving NotificationDelivery exclusively for legacy delivery. This avoids synchronizing two competing new status records. NotificationSync and NotificationRun persist scan progress; NotificationProviderEvent retains raw-free signed-event receipts.
- Legacy mode remains the default. Drain mode supports cancellation-only rollback. No production deployment, production migration, real email, or webhook registration was performed.
- A final optional schema-drift comparison could not run because the Neon CLI session expired; the actual migration and SQL integration checks had already succeeded. The temporary branch was created with automatic expiry on September 23, 2026.

### Release work still required

Configure Resend sender/quota/webhook, apply migrations to the target deployment, enable the new mode with a measured cohort, run an authorized-recipient smoke test, and observe two real daily runs. These checks require the deployed environment and are not represented as completed by local tests.


## Objective and constraints

Keep the notification cron at once daily. Replace individual task emails with a daily task summary, and schedule interview emails with Resend during normal API requests. The daily job fills the scheduling horizon and reconciles failures. No additional cron, persistent process, browser timer, or external worker is required.

This design assumes ordinary API requests and provider webhooks remain available throughout the day. It cannot guarantee prompt recovery from provider outages with only daily background execution. Provider acceptance also does not guarantee inbox delivery at an exact time.

## Current implementation

- `backend/vercel.json`: notification delivery runs daily at 15:07 UTC. Preserve this frequency and the unrelated maintenance entries.
- `notifications.services.js`: discovers only interviews already inside their reminder window, sends individual task emails, and processes at most 50 deliveries within a 45-second budget. Daily retries exceed its 23-hour safe retry window.
- `notification-policy.js`: already contains timezone, quiet-hour, eligibility, and unsubscribe helpers worth preserving.
- `notification-email.services.js`: sends immediately through Resend and returns an email ID; it needs scheduling, retrieval, and cancellation operations.
- `NotificationSettings.tsx`: incorrectly says delivery is checked every five minutes. Correct this during implementation.
- `NotificationDelivery` cascades on account deletion. Provider cancellation work must not disappear with those rows.

## Product behavior to implement

### Daily task digest

1. At the daily run, produce at most one nonempty digest per opted-in, verified user per scheduled UTC run date. Retries of the same run reuse that identity even across midnight or timezone changes.
2. Include unfinished dated tasks in sections for overdue, due today, and upcoming. Preserve the existing upcoming/overdue switches and interpret `taskReminderDays` as the upcoming lookahead in the user's calendar days. Exclude undated and completed tasks.
3. Open overdue tasks may appear in subsequent daily digests. This intentionally replaces the current once-per-deadline behavior and must be explained in settings.
4. Render a bounded list (initially 20 tasks total, due today first, then overdue, then upcoming), section totals, and a link to the full task list. Include the snapshot timestamp and user's timezone. Do not send empty emails.
5. Ordinarily send at the daily run, with no user-selected send-time setting. If quiet hours apply, schedule the snapshot through Resend for the next allowed time before the next nominal daily run. If that is no longer possible, skip it. The email explicitly remains a snapshot, not a live task list.
6. Task completion after snapshot creation does not rebuild the digest. Unsubscribe, account deletion, disabling an included category, or changing timezone/quiet hours cancels a pending digest; a fresh digest is generated on the next daily run.
7. Never replay yesterday's digest after the next run begins. A missed cron produces a current summary when execution resumes, not a backlog of old summaries.

### Interview reminders

1. Calculate `sendAt = scheduledAt - interviewReminderMinutes`, then apply the existing next-allowed-time policy. Skip if the resulting send time is at or after interview start.
2. Maintain a rolling 7-day scheduling horizon measured by reminder send time, comfortably inside Resend's 30-day limit. Store farther-future intent locally; the daily job schedules it when eligible. Seven days provides headroom for missed daily runs without scheduling every distant interview.
3. Create or reconcile the reminder immediately after an interview is created or changed. If its reminder time already passed but the interview is still future, send promptly outside quiet hours; never send after interview start.
4. Each effective reminder revision has one immutable payload and creation idempotency key. A change to time, content, recipient, lead time, or relevant preferences can create a replacement revision. No-op edits do not create another reminder.
5. Cancel an old scheduled email before scheduling a replacement. If cancellation is uncertain, hold the replacement for reconciliation rather than knowingly scheduling both. If the old reminder already sent, a genuinely rescheduled future interview may receive a new reminder; cosmetic edits alone must not resend.
6. Surface provider failures as “Interview saved; reminder scheduling needs attention,” with an authenticated retry action. Do not fail or roll back an otherwise valid interview edit because Resend is unavailable.

## Phase 1 — Durable notification state and policy

Files: Prisma schema and a new additive migration; `notification-policy.js`; new focused notification policy tests.

- Add `TASK_DIGEST` and distinguish provider scheduling from actual sending. Suggested delivery states: `PENDING`, `PROCESSING`, `SCHEDULED`, `CANCEL_PENDING`, `SENT`, `CANCELED`, `SKIPPED`, `FAILED`, `UNKNOWN`. Track delivered/bounced outcomes separately from send state.
- Add intended send time, digest run date/snapshot time, source revision, payload hash, and provider outcome timestamps. Make resource association suitable for digests without inventing a fake task ID.
- Add a durable provider-operation table for schedule/cancel/reconcile work: unique operation key, operation type, notification revision, provider ID when known, immutable request data for creation retries, attempt timestamps, next attempt, lease token/expiry, and sanitized outcome.
- Keep desired state distinct from provider-confirmed state. A DB flag cannot itself cancel an email already held by Resend.
- Ensure cancellation tombstones survive user/interview/application deletion. Retain only opaque provider IDs, operation identity and minimal timestamps after account deletion; clear recipient/content data. Define retention and cleanup for terminal operations.
- Preserve old delivery rows and dedupe keys. Test additive migration on an isolated database branch using a direct migration connection.

Exit: policy tests cover local date boundaries, DST, quiet hours, same-day interviews, horizon boundaries, empty digests, digest expiration, and revision identity. Concurrent database writes cannot create duplicate operations for the same revision.

## Phase 2 — Resend adapter and safe operation processor

Files: `notification-email.services.js`; new `notification-provider.services.js` and `notification-operations.services.js`; provider tests.

- Implement send/schedule (`scheduled_at` in the REST payload), retrieve, and cancel using the existing fetch-based adapter. Use cancellation plus replacement for changed content; no need to depend on mutable scheduled email contents.
- Persist immutable creation parameters before calling Resend. Use a stable key per creation operation, timeouts, and bounded retries that respect rate-limit responses and the API request deadline.
- Use leases and revision checks around work. Do not perform provider network calls inside the source database transaction. Await a bounded post-commit attempt before returning; never rely on fire-and-forget execution after an HTTP response.
- After a stale in-flight schedule completes, retain its returned provider ID and enqueue compensation cancellation. Revision checks alone do not undo a provider request.
- Keep the current conservative sub-24-hour creation-retry boundary. If an acceptance response was lost, retry only with identical parameters/key inside that boundary. Afterward, do not automatically create a fresh email without positive reconciliation; mark `UNKNOWN` and expose it operationally.
- Known provider IDs can be retrieved/canceled in later daily runs without recreating the email. Do not treat all provider errors as proof an operation failed before acceptance.
- Distinguish accepted scheduling from sent and delivered. Sanitize stored errors; redact recipient, payload, token, and API key data from logs.

Exit: provider timeout after acceptance, database acknowledgement failure, expired idempotency window, duplicate requests, concurrent claims, stale schedule completion, and cancellation-versus-send races have deterministic tests.

## Phase 3 — Interview and account lifecycle integration

Files: interview/application/auth services and controllers; notification preferences/unsubscribe services; frontend interview save handling.

- Transactionally record desired reminder changes alongside interview create/update/delete. Include automatic application changes and application deletion that cascades interviews.
- Reconcile reminders when linked company/role display content changes, notification opt-in/category/lead time/timezone/quiet hours changes, or verification/recipient state changes. Trigger from common backend services so extension and web requests behave consistently.
- After commit, prioritize cancellation operations, then new schedules. Return scheduling status separately from the successful domain mutation.
- Implement authenticated, ownership-checked, rate-limited retry for reminder reconciliation. Preference changes affecting many interviews use a bounded attempt and report remaining work honestly.
- Unsubscribe immediately blocks new schedules, durably queues all cancellations, and attempts them in the request. If provider cancellation remains pending, say preferences are disabled but an already-scheduled email may still arrive. Preserve signed, idempotent one-click unsubscribe behavior.
- Account deletion first blocks new scheduling and captures cancellation obligations atomically. Preserve unresolved cancellation tombstones across deletion and handle late in-flight schedule results; do not cascade away the only provider IDs. Keep existing private resume cleanup behavior intact.

Exit: updates from both clients reconcile; cancellation/restoration and repeat edits behave correctly; pending cancellation survives deletion; no cross-user retry or cancellation is possible.

## Phase 4 — Daily digest and reconciliation job

Files: `notifications.services.js`, new digest renderer/service, existing maintenance route, `backend/NOTIFICATIONS.md`.

- Replace old per-task discovery with digest discovery. Build a fresh payload only before the first provider attempt, then freeze it for safe retries. Preserve HTML escaping and unsubscribe headers.
- Run cancellation/reconciliation first, then urgent interview schedules, digests, and farther-future scheduling. Ensure fairness so one large account cannot starve others.
- Scan eligible users and future interview intents in bounded pages. Persist progress and enforce a budget during discovery as well as provider calls; the current budget check starts too late to bound discovery.
- Use the one daily invocation to refresh the 7-day horizon, recover safe outstanding operations, expire stale digests/reminders, and reconcile known provider IDs. Do not claim minute-based backoff will execute without an incoming request or the next daily run.
- Remove the fixed 50-delivery assumption as a release capacity target. Benchmark a full daily workload against the actual function duration, Resend rate limits, and daily/monthly email quotas. A daily digest per user increases email volume.
- If the intended workload cannot drain in one invocation, reduce the enabled rollout cohort or scope before release. Persisting a cursor prevents loss but does not make a multi-day digest backlog acceptable. Do not silently add another worker or scheduled job.
- Return counts for digests, scheduled interviews, pending cancellations, unknown outcomes, expired work, backlog age and last completed run. Report incomplete runs as operational failures.

Exit: duplicate daily invocations send no duplicate digest, missing a day does not replay stale digests, and the measured rollout workload completes within provider/runtime limits.

## Phase 5 — Provider events and user-facing settings

Files: notification routes, Express app middleware, notification API types, `NotificationSettings.tsx`, interview feedback, README and notification operations guide.

- Add a signature-verified Resend webhook endpoint with access to the raw request body. Deduplicate event IDs and tolerate duplicate/out-of-order events. Track sent, delivered, bounced, failed and suppressed outcomes supported by the provider; delivery events never trigger an automatic resend.
- Correlate events to provider IDs and opaque notification identifiers where supported. Keep a bounded unmatched-event path for events arriving before the local provider acknowledgement is saved. Daily retrieval of known IDs remains a fallback.
- Relabel task controls as daily summary sections and upcoming-day range. Explain repeated inclusion of open overdue tasks, the daily UTC-based run, quiet-hour deferral, snapshot content, and approximate delivery timing.
- Retain interview lead-time controls; show pending/failed scheduling and cancellation feedback with retry. Remove the false five-minute polling claim.
- Retain email opt-out defaults and existing opt-ins; do not enable users automatically. Clearly announce the change from individual task notices to daily summaries.

Exit: settings and interview UI tests cover successful save, partial provider failure, retry, quiet-hour explanation, and pending cancellation. Webhook tests reject invalid signatures and handle replay/order variations.

## Phase 6 — Migration, verification and controlled release

1. Ship additive schema and code behind a `legacy` / `daily-digest-scheduled-interviews` mode switch. Test on an isolated database and with a fake provider first.
2. Run backend/frontend/extension suites, frontend lint/build, and real database integration tests for leases, uniqueness, revisions, account deletion and concurrent edits. Do not modify unrelated existing workspace changes.
3. Before cutover, stop legacy discovery and let active leases settle. Cancel old unattempted work; reconcile attempted/unknown rows rather than resetting them. Retain historical dedupe records and suppress reminders already sent for the same interview occurrence.
4. Backfill eligible future interview intents for currently opted-in users. Schedule near-term interviews first. Enable the digest on the next nominal daily run.
5. Smoke-test with an explicitly authorized recipient: scheduled send, cancellation, reschedule, quiet-hour deferral, unsubscribe, provider webhook, and a real daily digest. Verify actual account quotas and scheduler execution; documentation alone is insufficient.
6. Observe at least two daily cycles plus a scheduled interview delivered between cycles. Verify no legacy/new double sends, stale pending work, or orphaned provider schedules.
7. Rollback stops new scheduling and digests but keeps cancellation/reconciliation/webhooks running until provider-held emails are resolved. Turning off code does not recall emails. Never immediately restart the legacy sender over unresolved new schedules.

## Release acceptance criteria

- A future interview reminder arrives between daily cron runs without another background invocation.
- Saving a near-term interview attempts its reminder immediately.
- Each daily run produces at most one task digest per user, with correct local-day grouping and explicit snapshot semantics.
- Confirmed cancellation prevents pending provider delivery; failures remain visible and recoverable rather than being reported as completed cancellations.
- A crash or ambiguous response cannot trigger an unconditional resend after the provider deduplication window.
- Account/application/interview deletion leaves no lost cancellation obligation.
- Intended daily workload fits the available runtime and email quotas.
- Settings, operational documentation, and deployment behavior agree.

## Known limitations

Provider outages during urgent scheduling/cancellation can cause a missed or stale reminder before daily repair. An email already sent cannot be recalled. A quiet-hour-delayed digest can contain tasks completed after its snapshot. These are explicit tradeoffs of this architecture, not problems a once-daily retry loop can eliminate.

## Provider references checked for this plan

- [Resend scheduled sending and 30-day horizon](https://resend.com/changelog/extended-email-scheduling)
- [Send Email REST API](https://resend.com/docs/api-reference/emails/send-email)
- [Cancel Email](https://resend.com/docs/api-reference/emails/cancel-email)
- [24-hour idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Webhook event types](https://resend.com/docs/webhooks/event-types)

Verify provider request limits, quotas, webhook verification requirements and API behavior again when implementing against the configured account.
