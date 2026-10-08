# Release verification

## Pending capacity/atomic-save release

Local changes add `20261001000000_notification_capacity`, a shared Resend throttle, resumable worker batches, independent operator monitoring, and atomic application/resume saves. Apply the migration and deploy API/frontend together. Retain the existing five-user cohort until an actual five-minute scheduler, independent alert receiver and live delivery/cancellation acceptance checks are verified. Select `vercel.scaled.json` on a supported plan or use an external scheduler; set NOTIFICATION_WORKER_INTERVAL_SECONDS=300 before expanding enrollment. The default deployment config still runs daily.

Tests were run on temporary branch `notification-capacity-20261001` (`br-rough-recipe-arnstkve`), which expires October 3, 2026 at 05:40 UTC. The new migration, real SQL atomic rollback/ownership/history checks, expanded reminder queue and shared throttle checks passed. Synthetic providers sent no real emails. These local changes have not been deployed to production.

Validation: 172 backend tests, 78 frontend tests, 15 extension tests, frontend lint/build, extension typecheck, desktop/mobile resume-save browser workflows, isolated notification SQL checks (including overlapping worker exclusion), and isolated atomic-save SQL checks passed. The browser test asserts exactly one application save request carries the selected resume ID. CI now runs both isolated SQL regression scripts against its disposable PostgreSQL service.

## Release completed September 30, 2026 UTC

- Production snapshot `snap-red-dew-ar7qstlh` was created before migration and expires October 7 at 12:00 UTC. Temporary validation branch `release-20260930-check` expires October 2 at 12:00 UTC.
- All 19 migrations are applied in production, including `20260924000000_contact_phone`; checksums match after allowing LF/CRLF checkout differences. All application accounts have linked managed identities.
- API deployment `dpl_DxacYJV1Vahkq161Azz5c1bJY7zW` and frontend deployment `dpl_Ed8rgmmn9sKvrebEpZrtvYvRejbX` were built, checked, and promoted to `api.jobhazel.com` and `jobhazel.com`. Public readiness and frontend return 200; anonymous account access and notification-maintenance status return 401.
- Production reminder settings were individually verified: scheduled-interview/daily-digest mode, cohort limit 5, and work budget 45000 ms. Existing secrets were preserved.
- The latest observed notification run was completed for September 29; the latest resume cleanup completed September 29 at 11:48 UTC with zero failures. No reminder operations or webhook receipts existed during verification, so live scheduled-email delivery remains unproven.
- Validation passed: 162 existing backend tests plus the new migration-checksum regression, 78 frontend tests, frontend lint/build, all ten desktop/mobile browser workflows across the initial run and corrected interview reruns, isolated notification SQL integration, and isolated real Neon Auth integration (verification/recovery, replay rejection, sessions, password changes, logout and deletion).
- Browser-test setup was corrected to authenticate its preference mutation with the required Origin header, assert success, and target the current desktop/mobile interview controls. Deployment uploads now exclude browser reports, traces, and the E2E build directory.
- The locally configured R2 bucket passed real synthetic signed PDF upload/download, byte equality, size/content-type checks, and production-origin upload CORS checks. An unrelated origin was rejected. The unsigned S3 request returned 400 and no object content. The synthetic object was deleted. Bucket CORS administration returned 403 with the object-scoped token; Cloudflare public development/custom-domain settings still need account-level verification. These checks do not independently prove that the redacted Vercel R2 settings identify the same bucket.
- An authorized recovery-email request through the deployed API returned 200. This non-enumerating response is not proof of inbox receipt; the existing account password was not changed.

Remaining live acceptance checks: finish browser auth/recovery and application-level resume upload/download with an authorized test account; confirm Cloudflare public-access settings; deliver a scheduled reminder and observe its signed callback; verify rescheduling and unsubscribe cancel provider-held messages. Approval to use a disposable alias for the supplied email address is pending. Do not call these checks complete based on simulated providers or configuration alone.

## Observed production state, September 29, 2026

Read-only checks against the linked production branch and Vercel deployment found:

- The site and API readiness endpoint return 200. The API deployment is ready and was created September 24.
- Managed auth is configured for OTP verification with `https://jobhazel.com` trusted. All application accounts have linked managed identities.
- Auth and both notification redesign migrations are applied. `20260924000000_contact_phone` is still pending in production; the isolated `dev-neon-auth` branch has it applied.
- The latest completed notification run was September 28 at 15:07 UTC. Resume cleanup completed September 29 at 04:48 UTC.
- There were zero unknown or failed desired notification operations, zero email opt-ins, and no provider webhook receipts. This confirms scheduler activity, not email delivery or webhook configuration.

These observations supersede the older claim that managed auth had not been deployed. They do not establish private bucket configuration, recovery email delivery, browser cookie behavior, or signed reminder delivery. No production changes or test emails were made during these checks.

## Deployment sequence

1. Run the CI workflow and the isolated provider integration checks before release. The browser suite uses a real database/API with simulated remote providers; it cannot certify Neon, Cloudflare, or Resend configuration.
2. Confirm a recoverable database snapshot and apply pending migrations through Prisma's direct connection. The existing `vercel-build` command runs `prisma migrate deploy`; never point it at a different branch's Auth endpoint. The contact-phone migration is additive.
3. Configure production explicitly: `NEON_AUTH_BASE_URL`, a stable 32+ character `AUTH_RATE_LIMIT_SECRET`, HTTPS `APP_URL`/`API_PUBLIC_URL`, matching `CORS_ORIGIN`, secure cookies, and a 32+ character `CRON_SECRET`. Leave `RESUME_CLEANUP_SECRET` empty or equal to `CRON_SECRET`. Startup now refuses incomplete production configuration.
4. For reminder rollout, set `NOTIFICATION_MODE=daily-digest-scheduled-interviews`, a verified `EMAIL_FROM`, `RESEND_API_KEY`, stable 32+ character `NOTIFICATION_UNSUBSCRIBE_SECRET`, and `RESEND_WEBHOOK_SECRET`. Configure the signed webhook as documented in `NOTIFICATIONS.md`. Keep the initial cohort bounded until delivery and quota checks pass. The checked-in function limit is 60 seconds with a maximum 45-second work budget.
5. Deploy the API and frontend as a coordinated release. The new readiness query fails if required schema is missing. Verify login, recovery, reload, logout, contact-phone persistence, and PDF upload/download using an authorized test account. Confirm R2 public access and public custom domains are disabled in Cloudflare.
6. From `backend`, run `npm run verify:release` with the actual production environment injected. It is read-only: migration checksums, managed identity links, R2 access/CORS, public endpoints, scheduler status, and recent successful cleanup. It never runs the delivery or cleanup endpoints. It exits nonzero for failed/unverified automated checks and reports the remaining manual checks separately. Bucket-management permissions may be needed to inspect CORS; an access failure is not proof the bucket is misconfigured.
7. Verify one opted-in recipient's actual scheduled reminder and signed provider callback before increasing the cohort. Verify rescheduling/unsubscribe cancels the prior email. Only an explicitly authorized recipient should receive test email.

## Operator checks

`GET /notifications/maintenance/status`, authenticated with `Authorization: Bearer <CRON_SECRET>`, is read-only and returns 503 for invalid configuration, missed daily runs (one hour grace), capacity exclusions, overdue work, or unresolved failures. It returns aggregate counts, never recipients or message payloads. `lastWebhookAt: null` means callbacks have not been observed; it is expected before any reminders are sent.

`GET /resumes/maintenance/status` uses the same bearer token and reports `status.latestCleanupRun`. Check that it is completed, has zero failures, and is recent. Do not use the mutating cleanup/deliver URLs for a health probe.

For rollback of reminders, use `drain` to cancel/reconcile outstanding provider schedules first. Reverting code or switching to legacy does not undo provider-side schedules. See `NOTIFICATIONS.md`. Auth rollback must preserve migrated credentials; use the consistent-snapshot procedure in `NEON_AUTH_MIGRATION.md`.
