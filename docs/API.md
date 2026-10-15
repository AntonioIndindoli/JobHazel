# API reference

[Project overview](../README.MD) · [Local development](DEVELOPMENT.md) · [Implementation notes](IMPLEMENTATION.md)

Paths are relative to the backend origin, with **no `/api` prefix**. The local default is `http://localhost:4000`.

## Authentication and access

Protected user-data routes validate the managed Neon Auth session. The web app sends the API's HttpOnly session cookie with `credentials: "include"`; the extension sends its managed credential as a bearer token. Web mutations require a trusted request origin.

Health and account signup/login/recovery routes are public. Notification unsubscribe uses a signed token instead of a login. Maintenance endpoints require their scheduler bearer secret, and the provider webhook verifies its signature.

## Route groups

| Area | Routes |
| --- | --- |
| Health | `GET /health/live`, `GET /health/ready` |
| Signup and verification | `POST /auth/signup`, `POST /auth/verify-email`, `POST /auth/resend-verification` |
| Web sessions | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| Recovery | `POST /auth/forgot-password`, `POST /auth/reset-password` |
| Extension sessions | `POST /auth/extension/login`, `POST /auth/extension/refresh`, `POST /auth/extension/logout` |
| Account | `PATCH /auth/profile`, `PATCH /auth/password`, `GET /auth/export`, `DELETE /auth/account` |
| Applications | `GET /applications`, `POST /applications`, `GET /applications/:id`, `PUT /applications/:id`, `PATCH /applications/:id/status`, `DELETE /applications/:id` |
| Application history | `GET /applications/history`, `GET /applications/:id/history`, `DELETE /applications/:id/history/:activityLogId` |
| Application resume | `PUT /applications/:id/resume` |
| Interviews | `GET /interviews`, `POST /interviews`, `PATCH /interviews/:id`, `DELETE /interviews/:id` |
| Tasks | `GET /tasks`, `POST /tasks`, `PATCH /tasks/:id`, `PATCH /tasks/:id/complete`, `DELETE /tasks/:id` |
| Task preferences | `GET /tasks/preferences`, `PATCH /tasks/preferences` |
| Contacts | `GET /contacts`, `POST /contacts`, `GET /contacts/:id`, `PATCH /contacts/:id`, `DELETE /contacts/:id` |
| Imports | `POST /imports/create-draft`, `GET /imports/:id`, `POST /imports/:id/convert` |
| Parser | `POST /parser/job-description` |
| Resumes | `GET /resumes`, `GET /resumes/analytics`, `POST /resumes/uploads`, `POST /resumes/:id/complete`, `GET /resumes/:id/download-url`, `PATCH /resumes/:id`, `DELETE /resumes/:id` |
| Notification preferences | `GET /notifications/preferences`, `PATCH /notifications/preferences` |
| Notification state | `GET /notifications/status`, `POST /notifications/retry` |
| Unsubscribe | `GET /notifications/unsubscribe`, `POST /notifications/unsubscribe` |
| Provider webhook | `POST /notifications/webhook` |
| Notification maintenance | `GET /notifications/maintenance/status`, `GET /notifications/maintenance/deliver` |
| Resume maintenance | `GET /resumes/maintenance/status`, `GET /resumes/maintenance/cleanup`, `POST /resumes/maintenance/cleanup` |
| Auth maintenance | `GET /auth/maintenance/cleanup` |

## Behavior notes

- `/auth/refresh` checks the current managed session; it does not rotate a locally issued token. Temporary provider failures are retryable. See [Auth integration](../backend/NEON_AUTH_MIGRATION.md).
- `/auth/export` defaults to JSON. Use `?format=csv` for application records. Resume metadata is included in JSON; PDF bytes and storage credentials are excluded.
- Application create/update accepts an optional `resumeVersionId`, validated within the save transaction. On update, omission preserves the existing association and `null` removes it. The dedicated association route attaches, replaces, or removes a resume.
- Import draft creation can reuse a capture ID. Conversion claims the draft and creates its application in one transaction; completed conversions return an already-converted result. Duplicate candidates require explicit override before conversion.
- Resume upload begins with `/resumes/uploads`, transfers the file to a signed storage URL, and finishes with `/resumes/:id/complete`. Download access is issued through `/resumes/:id/download-url`.
- `GET /notifications/unsubscribe` is read-only; `POST` confirms unsubscribe with the signed token. Preference changes and retry requests can trigger provider synchronization.
- Notification maintenance requires `CRON_SECRET`. Resume and auth maintenance use `RESUME_CLEANUP_SECRET`, falling back to `CRON_SECRET`. Status endpoints are read-only; delivery and cleanup endpoints perform work.
- Most analytics are computed in the frontend. Resume performance is the exception, using `/resumes/analytics`.

Validation and ownership checks live in [route handlers](../backend/src/routes), [validators](../backend/src/validators), and [domain services](../backend/src/services). See [notification operations](../backend/NOTIFICATIONS.md) and [release verification](../backend/RELEASE.md) for provider and maintenance requirements.
