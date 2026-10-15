# Implementation notes

[Project overview](../README.MD) · [Local development](DEVELOPMENT.md) · [API reference](API.md)

This reference describes the repository's implemented behavior. The [web/API release notes](../backend/RELEASE.md) and [extension release checklist](../extension/RELEASE.md) record deployment evidence and remaining acceptance checks.

## Applications and related records

Applications store company, role, source, posting URL, location, workplace/employment type, salary, priority, dates, description, and notes. Search, filtering, editing, deletion, and activity history support both list and Kanban workflows.

The six fixed stages are **Saved, Applied, Interviewing, Offer, Rejected, and Withdrawn**. Recruiter screen, technical, manager, panel, final, take-home, and other are interview types.

Interviews link to applications and store schedule, duration, location or meeting URL, interviewer, notes, and outcome. Contacts record recruiters, referrals, hiring managers, employees, and others, with company/application associations and contact details. Company records support these relationships without a separate company-management screen.

## Accounts and sessions

- Email/password signup uses six-digit verification codes. Neon Auth manages verification, recovery, password hashes, sessions, and revocation.
- Web credentials stay in an HttpOnly cookie. The extension has a separate managed session. Temporary provider failures return retryable errors and preserve the web session.
- Profile editing, signed-in password changes, JSON/CSV export, and account deletion are supported. Signup is capped at 1,000 current accounts; deleting an account frees a slot.
- Verification resend and password recovery return non-enumerating responses. Both are limited to 20 requests per IP and 3 per normalized email in a 15-minute window, separately for each endpoint.
- Rate limits persist in the database. Limited requests return HTTP 429 with `AUTH_RATE_LIMITED` and `Retry-After`; key identifiers use HMAC digests.
- Signed-in email changes, social sign-in, and MFA are outside the current account workflow.

Existing accounts were linked to managed identities through the Auth migration. See [Auth integration and cutover](../backend/NEON_AUTH_MIGRATION.md) for identity links, session behavior, and migration procedures.

## Job imports and the extension

The rules-based parser combines deterministic extraction, a skills dictionary, HTML metadata, and structured job data. It extracts candidate title, company, location, salary, description, source, and skills for review. When no description is supplied, it attempts to fetch the posting URL.

Access restrictions and dynamically rendered pages can require pasted text, extension capture, or manual corrections. Duplicate detection compares normalized posting URLs or exact company/title pairs, ignoring case and surrounding whitespace. It does not perform fuzzy role-name matching or AI parsing.

On LinkedIn, the Chrome side panel captures the selected job's visible details and canonical posting URL. On other sites, it captures the active HTTP(S) page's URL/title and optional selected text. Users can sign in, review/edit a draft, override duplicate warnings, and save without leaving the panel.

Captures are temporarily bounded in extension storage. Capture IDs allow retries to reuse a draft; draft conversion and its application, activity, and generated task commit together. A repeated or concurrent conversion observes the completed draft rather than creating another application.

Development builds use a checked-in public key for a stable unpacked ID. Production ZIP packaging is implemented, and sessions are isolated by API URL. See [the extension guide](../extension/README.md) for installation, privacy, and workflows; store publication and authenticated production Chrome acceptance remain in [the release checklist](../extension/RELEASE.md).

## Resume lifecycle

The resume library supports PDF upload, naming and notes, download, archiving, and permanent deletion of unreferenced versions. Each application can reference one version, with filters for a chosen resume or no resume.

- Default limits are **5 MB per upload** and **10 active versions**; both are configurable.
- Files reside in Cloudflare R2; the database stores metadata and object keys. Signed upload/download URLs expire after **five minutes** by default.
- Upload completion checks stored size, content type, and the PDF signature before marking a file ready. Checksums support duplicate detection.
- Revised files create new versions. Renaming or editing notes does not replace file contents.
- Archived versions remain available to applications already linked to them. Newly selected archived versions are rejected, and referenced files cannot be permanently deleted.
- Association changes create history events. Moving an application to Applied without a resume produces a non-blocking warning.
- Rate limits, abandoned-upload cleanup, maintenance status, and retryable storage cleanup during account deletion support the file lifecycle.

Application create/update requests accept `resumeVersionId`. The application, company, resume association, history, and generated follow-up task share one transaction. Invalid, foreign, incomplete, or newly selected archived resumes reject the entire save. On update, omitting the field preserves the association; `null` removes it. A separate association endpoint supports quick changes.

Deployed storage permissions, CORS, cleanup execution, and application-level file access have acceptance checks in [release verification](../backend/RELEASE.md). See [the resume feature document](../RESUME-FEATURE.md) for the broader phased scope.

## Tasks and email reminders

Tasks support due dates, completion/reopening, follow-ups, preparation, thank-you notes, and overdue/upcoming views. Optional automation creates follow-up and thank-you tasks with independent delays of 0–365 days.

Thank-you tasks are created when an interview is added, with a due date based on its schedule. The application does not detect interview completion in the background.

Email reminders are opt-in and require verified addresses. Preferences include time zones, lead times, quiet hours, and unsubscribe controls. The scheduled-interview/daily-digest mode tracks provider operations, retries, cancellation, and callback state in the database; a legacy mode remains available for staged rollout.

Provider quotas, scheduler frequency, capacity, and live delivery affect behavior. See [notification design and operations](../backend/NOTIFICATIONS.md) for modes, throttling, monitoring, and acceptance checks. Push notifications are not implemented.

## Analytics, exports, and interface

Most dashboard metrics are calculated in [the frontend analytics module](../frontend/app/lib/application-analytics.ts) from applications, interviews, and activity history. These include pipeline/conversion metrics, source comparisons, and weekly volume. Resume-version performance uses the backend's authenticated `GET /resumes/analytics` aggregation. These are comparisons of recorded outcomes, not resume-content scores.

The geographic map uses Leaflet, external geocoding, and a browser cache. Pipeline charts include D3 Sankey and custom chart components. Kanban uses native browser drag-and-drop handlers. The interface supports dark mode, responsive layouts, and mobile navigation.

Account export produces JSON; application export produces CSV. Resume exports include metadata, not PDF bytes or private storage credentials.

## Future scope

These are potential extensions, not implemented features or release commitments:

- Gmail import/application-confirmation detection, Google Calendar sync, and job-board application-history synchronization.
- CSV import; CSV export already exists.
- Resume text extraction, job matching, scoring, rewriting, and tailoring.
- AI-powered parsing and interview preparation.
- Cover letters, portfolios, writing samples, take-home documents, and DOC/DOCX uploads.
- Custom pipeline stages, push reminders, and public activity reports.
- Installable PWA and offline support.

JobHazel does not submit applications on users' behalf.
