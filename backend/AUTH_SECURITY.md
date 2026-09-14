> Superseded for authentication by [Neon Auth migration](NEON_AUTH_MIGRATION.md). This document records the legacy hardening work; its custom JWT, refresh-token and email-link flows are no longer used by runtime routes.

# Authentication recovery operations

Apply the checked-in Prisma migration (`npm exec -- prisma migrate deploy` from `backend`) before deploying this backend. Generate the Prisma client with `npm run prisma:generate`. The migration adds address binding to recovery tokens and persistent rate-limit storage. Existing verification/reset links have no address binding and will be rejected; users must request a fresh link. No existing accounts or sessions are removed by the migration.

Rate limits use a 15-minute window, count successful and failed attempts, and persist across server instances:

| Endpoint | Per IP | Per normalized email |
| --- | ---: | ---: |
| Login (web and extension share quotas) | 50 | 10 |
| Signup | 20 | 5 |
| Forgot password | 20 | 3 |
| Verification resend | 20 | 3 |

Limited responses return HTTP 429, `AUTH_RATE_LIMITED`, and `Retry-After` in seconds. IP limits run before validation, including requests without an email. Keys contain an HMAC digest instead of raw email/IP values. Database failures fail closed.

For a deployment behind a reverse proxy, set `TRUST_PROXY` to a comma-separated list of the actual trusted proxy IP addresses/subnets. Ensure that proxy overwrites forwarded client headers. Without this setting Express uses the socket address; behind an unconfigured proxy, clients share its IP quota. Do not trust arbitrary forwarded headers or configure a broad public subnet.

Changing an email clears `emailVerifiedAt`, invalidates existing recovery links, revokes refresh sessions, and sends verification to the new address. Name-only or unchanged normalized-email edits preserve verification. Unverified email addresses are omitted from newly signed access-token email claims. Existing access tokens retain their normal short expiry; refresh and login require a verified address. Verification and reset tokens are bound to the exact address at issuance.

Email delivery has a 10-second timeout. Delivery failures invalidate the newly created link and return HTTP 503 with `AUTH_EMAIL_UNAVAILABLE`. A failed signup email leaves an unverified account; use verification resend to recover. A failed email-change notification leaves the new address unverified; resend verification to that address. Error responses do not disclose provider response details.

Vercel runs `GET /auth/maintenance/cleanup` daily at 04:27 UTC. This endpoint uses the existing maintenance bearer-secret configuration (`RESUME_CLEANUP_SECRET`, falling back to `CRON_SECRET`); configure `CRON_SECRET` for Vercel's scheduled request, and ensure both secrets match if both are set. Other hosts must schedule the same authenticated request. Cleanup removes expired/used/legacy auth tokens, expired/revoked refresh tokens, and expired rate-limit rows. Repeated runs are safe.

Validation: `npm test` runs service tests with deterministic Prisma adapters and HTTP tests against the actual auth router. These cover concurrent conditional consumption but do not substitute for migration/concurrency testing against a real PostgreSQL deployment. No live database migration is performed by the test suite.
