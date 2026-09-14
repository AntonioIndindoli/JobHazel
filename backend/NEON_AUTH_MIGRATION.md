# Neon Auth cutover

The runtime uses Neon managed Better Auth. The web app carries the managed credential in the API's HttpOnly `jobhazel_session` cookie; the extension stores its own managed credential. `/auth/refresh` is a compatibility session check, not token rotation. Every protected API call validates the managed session, so revocation applies immediately. Timeouts, provider errors and rate limits return retryable errors, not a sign-out.

The `accessToken: "cookie-session"` web response is only a UI marker. No credential is returned to browser JavaScript or persisted in localStorage. Keep the app and API on the same site (`https://jobhazel.com` and `https://api.jobhazel.com`). Unrelated domains require `COOKIE_SAME_SITE=none` and HTTPS, and browser third-party-cookie restrictions can still block them.

## Tested environment

Project `hidden-truth-21530643`, isolated branch `dev-neon-auth` (`br-dark-silence-arlilydn`). The workspace `.neon` now selects that branch; existing local `.env` files were not overwritten. Five existing accounts were imported on this branch. Production data, Auth settings and deployments have not been changed.

## Production sequence

1. Pause legacy account writes during the import/cutover. Take a Neon snapshot. Configure the production Auth trusted domains to include `https://jobhazel.com`. In Neon Auth enable email/password, require verification, select **OTP**, enable send-on-signup, and disable automatic sign-in after verification. The shared email provider supports codes, not verification links.
2. Set `DATABASE_URL_UNPOOLED` to the chosen production branch's direct URL and `DATABASE_URL` to its pooled URL. Run `npx prisma migrate deploy` from `backend`, then `npm run auth:migrate`. The import is transactional and idempotent. It refuses an existing Neon identity with the same email instead of silently merging accounts; review ownership before manually linking any conflict.
3. Configure the backend's `NEON_AUTH_BASE_URL` from that same branch, `AUTH_RATE_LIMIT_SECRET` to a stable random secret, `APP_URL=https://jobhazel.com`, `CORS_ORIGIN=https://jobhazel.com`, `COOKIE_SECURE=true`, and `COOKIE_SAME_SITE=lax`. The old JWT access secret is accepted only as a temporary fallback for rate-limit hashing. No JWT signing/refresh secrets or custom token TTLs are used for authentication.
4. Deploy backend and frontend together, and distribute the updated extension. The frontend stays a static export and needs no additional auth secret. Existing clients' extension login/refresh/logout endpoints remain compatible.
5. Verify login, reload, multiple tabs, password recovery, password change, sign-out, and account deletion. Check actual email delivery with an explicitly authorized test recipient. No live emails were sent during the isolated integration checks.

Existing custom sessions are intentionally not accepted after cutover: users sign in once again. Existing account IDs and all related records are preserved. On the first successful password proof, the old PBKDF2 password is converted using Better Auth's password helper, only if the imported Neon credential has no password. The legacy hash is then cleared. A password set/reset in Neon always wins and cannot be overwritten by the old password. Users can instead use the recovery-code flow. Accounts without a verified email must verify before accessing app data.

Neon currently does not support email changes in this configuration; the UI shows the address as read-only. Display-name and password changes remain available. The project's managed `/delete-user` endpoint returns 404, so after managed password confirmation, account deletion removes `neon_auth.user` and the local account in the same database transaction; cascading managed sessions are revoked. Private resume cleanup still must succeed before deletion.

Legacy auth tables remain for rollback/cleanup, but no runtime route issues or accepts their tokens. The historical implementation lives only under test fixtures. Do not switch back to the old login implementation after users have migrated their hashes; restore a consistent snapshot/code deployment if rollback is necessary.

## Verification

`npm test` in backend, frontend and extension; `npm run build` in frontend. `npm run test:auth:integration` requires the isolated branch's URL and Auth base URL and explicitly refuses production. It creates a disposable account, tests the live provider, then deletes its data. The seed/import script sends no messages and creates no sessions.

References: [Neon authentication flow](https://neon.com/docs/auth/authentication-flow), [user management](https://neon.com/docs/auth/guides/user-management), [email OTP](https://neon.com/docs/auth/guides/plugins/email-otp). The live service uses `__Secure-neon-auth.session_token`; this differs from the cookie spelling in the authentication-flow guide.

Verified: 133 backend tests, 43 frontend tests, and 15 extension tests, plus the frontend production build. Live isolated-branch checks cover verification/recovery codes and replay rejection, existing-password migration, concurrent session checks, HttpOnly cookies, password change, logout and account deletion.
