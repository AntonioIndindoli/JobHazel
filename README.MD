# JobHazel

JobHazel is a full-stack job application tracker for organizing applications, interviews, contacts, follow-up tasks, and the resume version used for each application.

**App:** [jobhazel.com](https://jobhazel.com/)

This README describes the implementation in this repository as of **September 12, 2026**, including current workspace changes. It does not confirm that every change has been deployed or verified in production. External account integrations and Chrome Web Store distribution are not implemented.

## Implemented features

| Area | Current behavior |
| --- | --- |
| Accounts | Email/password signup and verified-email login, verification-email resend, forgot-password recovery, session refresh, logout, profile editing, signed-in password changes, and account deletion. Signup is limited to 1,000 current accounts; deletion frees a slot. |
| Applications | Create, edit, delete, search, and filter applications. Store company, role, source, URL, location, workplace/employment type, salary, priority, dates, description, and notes. |
| Kanban | Drag applications between fixed stages and persist status changes. Application activity history records changes. |
| Imports | Paste a URL or description, create a parsed draft, review/edit extracted fields, and convert the draft into an application. |
| Chrome extension | Capture the active page URL, title, and optional selected text in a Manifest V3 side panel; sign in, review an idempotent parsed draft, handle duplicate warnings, and save the application without leaving the panel. |
| Duplicate detection | Detect normalized URL matches or exact company/title matches, ignoring company/title case and surrounding whitespace. |
| Interviews | Create, edit, and delete interviews linked to applications; record type, schedule, duration, location, meeting URL, interviewer, notes, and outcome. View upcoming interviews. |
| Tasks | Create, edit, delete, complete, and reopen tasks. Support follow-ups, preparation, thank-you notes, reminders, due dates, and overdue/upcoming views. |
| Task automation | Optional automatic follow-up and thank-you task creation, with separately configurable delays of 0–365 days and per-user preferences. |
| Contacts | Manage recruiters, referrals, hiring managers, employees, and other contacts, with company/application associations, email, LinkedIn URL, role, and notes. |
| Resume library | Upload immutable PDF versions; list, rename, annotate, download, archive/unarchive, and permanently delete unreferenced resumes. |
| Application resumes | Select one resume per application, change/remove it, download it from application details, and filter by resume or “No resume.” Association changes create history events. |
| Dashboard and analytics | Application and conversion metrics, pipeline visualization, source comparisons, weekly application volume, a geographic application map, and backend-aggregated performance metrics by resume version. |
| Data export | Download account data as JSON or application records as CSV. Resume exports include metadata, not file bytes or private storage credentials. |
| Appearance | Dark mode, responsive layouts, and mobile navigation. |

### Application stages

The six fixed application statuses are **Saved, Applied, Interviewing, Offer, Rejected, and Withdrawn**. Recruiter screen, technical, manager, panel, final, take-home, and other are interview types, not separate application stages. Custom stages are not supported.

### Account verification and recovery

New accounts verify their email through Neon Auth using six-digit codes. Neon manages password recovery, password hashes, sessions and revocation. Web credentials stay in an HttpOnly cookie, and transient failures preserve the session. See [Neon Auth migration and production cutover](backend/NEON_AUTH_MIGRATION.md); the migration has been tested on an isolated branch and is not yet deployed to production.

Requests to resend verification or recover a password return non-enumerating responses whether or not the email identifies an eligible account. Existing accounts created before the verification migration are marked verified by the migration. Dedicated abuse rate limits for these public email endpoints and re-verification after a signed-in email-address change are not yet implemented.

### Job importing

The parser uses deterministic rules, a skills dictionary, HTML metadata, and structured job data where available. It attempts URL fetching when no description text is supplied, and extracts candidate title, company, location, salary, description, source, and skills for review.

Fetching does not guarantee extraction from every job board. Access restrictions and dynamically rendered pages can require pasted or extension-captured selected text and manual corrections. Parsing is deterministic rather than AI-powered. Duplicate detection does not implement fuzzy role-name matching.

### Chrome extension

The `extension/` package implements a Chrome Manifest V3 side panel. It captures the active HTTP(S) page's URL and title plus optional selected text, stores bounded captures temporarily, and sends them through the same import-draft and conversion APIs used by the web interface. The panel has its own login, managed Neon Auth session, editable review form, duplicate override, and post-save link to JobHazel.

Development builds use the checked-in extension key to keep a stable unpacked extension ID. Production release work remains: create the store ZIP and listing assets, verify current Chrome Web Store requirements, publish through the project owner's account, set the resulting production ID in the frontend/backend configuration, and smoke-test it against the deployed service.

### Resume management

The resume library and application association UI are implemented; they are no longer API-only plans.

- PDF uploads only, with a default maximum of 5 MB and configurable active-resume quota (default: 10).
- Files reside in private Cloudflare R2 storage; the application stores metadata and object keys.
- Upload completion verifies stored content before exposing a resume as ready.
- Upload/download links expire after five minutes by default.
- A revised file creates a new version; changing its name or notes does not replace its contents.
- Archived resumes already linked to applications remain available in historical associations.
- Permanent deletion is blocked while an application references the resume.
- Moving an application to Applied without a resume produces a non-blocking warning.
- Backend lifecycle controls include endpoint rate limits, abandoned-upload cleanup, cleanup status reporting, and retryable storage cleanup during account deletion.

Application saving and resume association use separate requests. If association fails, the application may already be saved; the UI reports that partial result.

A scheduled cleanup entry exists in `backend/vercel.json`. Actual bucket privacy, credentials, CORS, migrations, scheduler execution, and cleanup behavior still need verification in the deployed environment.

The [resume feature document](RESUME-FEATURE.md) describes the broader phased scope. Storage, library UI, application associations, lifecycle hardening, and resume performance analytics are implemented. PDF text extraction, job matching, tailoring, and generalized application documents remain future work.

## Implemented foundations with remaining limitations

| Area | What is still missing or limited |
| --- | --- |
| Task automation | Creates in-app tasks, not email/push notifications. Thank-you tasks are created when an interview is added, with a due date based on its schedule; there is no background detection of interview completion. |
| Analytics | Most dashboard metrics are calculated in the frontend from applications, interviews, and activity history. Resume-version performance is aggregated by `GET /resumes/analytics`; there is no general-purpose backend analytics API. |
| Resume intelligence | The schema has an optional extracted-text field, but no PDF text-extraction pipeline, scoring, matching, or tailoring workflow. |
| Account access | Email verification, verification resend, signed-in password changes, and forgot-password recovery are implemented. Dedicated recovery/resend rate limits, re-verification after changing an account email, social sign-in, and MFA are not. |
| Companies | Company records support applications and contacts, but there is no dedicated company-management screen/API. |
| Mobile | Responsive web UI exists; installable PWA and offline support do not. |
| Imports | URL/text review and Chrome-extension capture work, but CSV import is absent. |
| Chrome extension | The side-panel workflow is implemented and tested locally, but Chrome Web Store packaging, listing, publication, production-ID rollout, and deployed smoke testing remain. |

## Not implemented / future work

These are potential extensions, not available features or release commitments:

- Gmail import and application-confirmation email detection.
- Google Calendar sync and interview detection.
- LinkedIn/Indeed application-history synchronization.
- CSV import (CSV export already exists).
- AI-powered job parsing and interview-preparation generation.
- Resume text extraction, job matching, scoring, rewriting, and tailoring. Resume-version outcome comparisons are implemented.
- Cover-letter, portfolio, writing-sample, and take-home document management; DOC/DOCX uploads.
- Custom pipeline stages.
- Email/push follow-up reminders.
- Public shareable job-search activity reports.
- Installable/offline PWA support.

JobHazel does not submit job applications on users' behalf.

## Architecture and stack

| Layer | Implementation |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, custom components and CSS, Tailwind CSS tooling. |
| Visualization | D3 Sankey, Leaflet, and custom chart components. The map uses external geocoding with a browser cache. |
| Drag and drop | Native browser drag-and-drop handlers. |
| Backend | Express 5 and JavaScript ES modules. |
| Authentication | Neon managed Better Auth, HttpOnly web sessions, and managed extension sessions. |
| Persistence | PostgreSQL with Prisma 7 and the PostgreSQL adapter; Neon connection tooling is included. |
| Files | Cloudflare R2 through the AWS S3 SDK, using signed upload/download URLs. |
| Tests | Node test runner for the backend; Vitest and Testing Library for the frontend. |
| Deployment support | Static frontend export (`frontend/out`) and a Vercel Express entry point/configuration for the backend. |
| Browser extension | Standalone TypeScript Manifest V3 package with a service worker, side panel, Chrome session/local storage, and production/development builds. |

The frontend and extension call the Express API, which accesses PostgreSQL and issues signed R2 URLs. Frontend, backend, and extension dependencies are installed separately; there is no root application package.

## Local development

Use Node.js **20.9 or newer**, npm, and PostgreSQL. Docker is optional for the included local database.

### 1. Configure environment files

Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`. Do not overwrite existing local configuration.

- Set the backend NEON_AUTH_BASE_URL for its database branch and a stable AUTH_RATE_LIMIT_SECRET. Follow backend/NEON_AUTH_MIGRATION.md before cutting over existing accounts.
- Set `APP_URL` to the frontend origin used in verification and password-reset links.
- Set `RESEND_API_KEY` and a verified `EMAIL_FROM` sender to deliver account emails. Without an API key, development logs account-action links; production treats email delivery as unconfigured.
- Set `DATABASE_URL`; use `DATABASE_URL_UNPOOLED` for a direct migration connection when using a pooled database service.
- Local database defaults use port `55489` and database name `jobappledger`.
- The API defaults to `http://localhost:4000`; the frontend defaults to `http://localhost:3000`.
- Set frontend `NEXT_PUBLIC_API_BASE_URL` to the API URL and backend `CORS_ORIGIN` to the frontend origin.

For resume storage, supply all five backend R2 settings: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, and `R2_ENDPOINT`. Apply appropriate bucket CORS settings; [an example is included](infra/cloudflare/r2-cors.json).

To run development without resume storage, leave **all five R2 values empty**. The example contains bucket/endpoint placeholders, which must also be cleared. Partial configuration fails startup validation, and resume storage operations require a configured provider.

### 2. Start a local database (optional)

From the repository root; skip if using an existing database:

```sh
docker compose -f infra/docker-compose.yml up -d
```

### 3. Install and start the backend

From `backend/`, after configuring `.env`:

```sh
npm install
npm run prisma:generate
npx prisma migrate deploy
npm run dev
```

Optionally run `npm run db:seed` to create/update the development seed user using the `SEED_USER_*` environment settings. Do not seed a production database with development credentials.

### 4. Install and start the frontend

In a second terminal, from `frontend/`:

```sh
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). The API exposes `/health/live` and `/health/ready` on port 4000.

### 5. Build and load the Chrome extension

From `extension/`, install dependencies and create the development build:

```sh
npm install
npm run build:dev
```

In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/dist/development`. The development build targets the local app/API configuration generated by the build script. See [the extension README](extension/README.md) for the complete workflow and production-build instructions.

### Builds and deployment configuration

Run `npm run build` from `frontend/` to generate the static site in `frontend/out`. Host that export with a static host; the current configuration is not a server-rendered Next.js deployment. Set `NEXT_PUBLIC_API_BASE_URL` when building.

The backend can run with `npm start` or its included Vercel entry point. Apply migrations before relying on new schema-dependent features. Production configuration requires complete R2 settings and a maintenance secret, plus appropriate `CORS_ORIGIN` and secure cookie settings.

For Vercel Cron, set `CRON_SECRET`. The backend falls back to it when `RESUME_CLEANUP_SECRET` is unset; if both are set, ensure the cron-supplied bearer token matches the effective cleanup secret. The included cron configuration requests cleanup daily at 04:17 UTC. Other hosts need an equivalent authenticated scheduled request.

## Implemented API routes

Paths are relative to the backend origin, with **no `/api` prefix** in Express. User-data routes require authentication; resume maintenance uses a separate bearer secret.

| Area | Routes |
| --- | --- |
| Health | `GET /health/live`, `GET /health/ready` |
| Authentication | `POST /auth/signup`, `POST /auth/login`, `POST /auth/verify-email`, `POST /auth/resend-verification`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/refresh`, `POST /auth/logout`, extension-specific `POST /auth/extension/login`, `/refresh`, and `/logout`, plus `GET /auth/me` |
| Account | `PATCH /auth/profile`, `PATCH /auth/password`, `GET /auth/export` (JSON, or `?format=csv` for applications), `DELETE /auth/account` |
| Applications | `GET /applications`, `POST /applications`, `GET /applications/:id`, `PUT /applications/:id`, `PATCH /applications/:id/status`, `DELETE /applications/:id` |
| Application history | `GET /applications/history`, `GET /applications/:id/history`, `DELETE /applications/:id/history/:activityLogId` |
| Application resume | `PUT /applications/:id/resume` (attach, replace, or remove) |
| Interviews | `GET /interviews`, `POST /interviews`, `PATCH /interviews/:id`, `DELETE /interviews/:id` |
| Tasks | `GET /tasks`, `POST /tasks`, `PATCH /tasks/:id`, `PATCH /tasks/:id/complete`, `DELETE /tasks/:id` |
| Task preferences | `GET /tasks/preferences`, `PATCH /tasks/preferences` |
| Contacts | `GET /contacts`, `POST /contacts`, `GET /contacts/:id`, `PATCH /contacts/:id`, `DELETE /contacts/:id` |
| Imports | `POST /imports/create-draft`, `GET /imports/:id`, `POST /imports/:id/convert` |
| Parser | `POST /parser/job-description` |
| Resumes | `GET /resumes`, `GET /resumes/analytics`, `POST /resumes/uploads`, `POST /resumes/:id/complete`, `GET /resumes/:id/download-url`, `PATCH /resumes/:id`, `DELETE /resumes/:id` |
| Resume maintenance | `GET /resumes/maintenance/status`, `GET /resumes/maintenance/cleanup`, `POST /resumes/maintenance/cleanup` |

Most analytics are computed in [the frontend analytics module](frontend/app/lib/application-analytics.ts). Resume performance is the exception and uses the authenticated `GET /resumes/analytics` aggregation endpoint.

## Verification and test coverage

Run `npm test` separately from `backend/`, `frontend/`, and `extension/`. The frontend also provides `npm run lint` and `npm run build`; the extension provides `npm run typecheck`, development/production builds, and `npm run verify:local` for its disposable-account integration workflow.

On September 12, 2026, **84 backend tests, 37 frontend tests, and 14 extension tests passed** against the reviewed workspace. The frontend production build and extension TypeScript/development build also passed. Backend coverage includes authentication and recovery validation, parsing, signup limits, exports, task automation, resume storage/lifecycle and analytics, and application-resume associations. Frontend coverage focuses on authentication UI, resume workflows, API helpers, extension handoff behavior, and application-resume interactions. Extension coverage includes session refresh, capture validation and limits, storage pruning, side-panel behavior, draft creation, and application defaults.

These suites include mocked dependencies. Passing tests does not verify live migrations, R2 permissions/CORS, scheduled maintenance, all browser workflows, or production deployment. Broad browser end-to-end coverage and a production-like manual pass remain verification work.

## Author

Built by Antonio Indindoli.
