## Resume Feature Scope

The resume feature is a private, versioned document library connected to the
application pipeline. Its first purpose is to answer: **which resume did the user
submit for this application?** Later phases can use the same records for performance
analytics and job-to-resume matching.

### MVP User Experience

The MVP includes:

* A resume library where users can upload, list, rename, download, archive, and
  permanently delete resume versions
* PDF uploads only, with a maximum file size of 5 MB
* A user-configurable display name, optional target role, and optional notes
* Resume selection inside the create/edit application drawer
* One selected resume version per application
* An explicit “No resume selected” state
* Resume name and download action in application details
* Application history events when a resume is attached, changed, or removed
* Application filtering by resume version
* Basic resume performance metrics after enough application outcome data exists

The MVP does not include:

* Resume editing or document generation
* AI rewriting, scoring, or automatic tailoring
* DOC/DOCX uploads
* Public resume links
* Automatic submission to job boards
* Cover letters, portfolios, or general-purpose application attachments
* Cross-user file deduplication

### Storage Choice and Cost Controls

Resume files are stored in a private Cloudflare R2 bucket. R2 is S3-compatible,
supports presigned URLs, and has a free allowance suitable for an early-stage
resume library. Current pricing must be checked before deployment in the
[Cloudflare R2 pricing documentation](https://developers.cloudflare.com/r2/pricing/).

The implementation keeps storage and hosting costs low by applying these rules:

* Upload directly from the browser to R2 using a short-lived presigned `PUT` URL
* Download directly from R2 using a short-lived presigned `GET` URL
* Never proxy normal file contents through the JobHazel API
* Never store file bytes or base64 data in PostgreSQL
* Accept PDF files only and reject files larger than 5 MB
* Limit each user to 10 active resume versions initially
* Calculate a SHA-256 checksum and reject duplicate files belonging to the same user
* Remove abandoned `PENDING` uploads using a scheduled cleanup job or R2 lifecycle rule
* Permanently delete the storage object when the corresponding unreferenced resume is deleted
* Avoid generated thumbnails and duplicate transformed copies in the MVP

Objects use server-generated keys rather than user-provided filenames:

```text
users/{userId}/resumes/{resumeVersionId}/{randomId}.pdf
```

The bucket remains private. `storageKey` is persisted; presigned URLs are generated
when needed and are never stored because they expire.

### Upload Lifecycle

```text
Authenticated browser
        |
        | POST /api/resumes/uploads
        v
JobHazel API validates quota and creates a PENDING ResumeVersion
        |
        | returns a short-lived presigned PUT URL
        v
Browser uploads PDF directly to private R2 bucket
        |
        | POST /api/resumes/:id/complete
        v
API verifies object existence, size, type, and ownership
        |
        | marks upload READY
        v
Resume becomes selectable on applications
```

If finalization fails, the record is marked `FAILED` or removed and the uploaded
object is deleted. `PENDING` and `FAILED` resumes never appear in application
selectors.

### Proposed Prisma Changes

```prisma
enum ResumeUploadStatus {
  PENDING
  READY
  FAILED
}

model ResumeVersion {
  id               String             @id @default(cuid())
  userId           String
  user             User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  name             String
  targetRole       String?
  storageKey       String             @unique
  originalFilename String
  mimeType         String
  sizeBytes        Int
  checksum         String?
  uploadStatus     ResumeUploadStatus @default(PENDING)
  extractedText    String?
  notes            String?
  archivedAt       DateTime?
  applications     Application[]
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt

  @@unique([userId, checksum])
  @@index([userId, archivedAt])
}
```

`Application.resumeVersionId` remains the selected-resume foreign key. Deleting
or archiving a resume must not silently substitute a different version.

Add application activity types for:

```text
RESUME_ATTACHED
RESUME_CHANGED
RESUME_REMOVED
```

Activity metadata should contain resume IDs and display names, but never a signed
URL, storage credential, extracted resume text, or other sensitive file contents.

### Resume API

```http
GET    /api/resumes
POST   /api/resumes/uploads
POST   /api/resumes/:id/complete
GET    /api/resumes/:id/download-url
PATCH  /api/resumes/:id
DELETE /api/resumes/:id

PUT    /api/applications/:id/resume
```

Endpoint responsibilities:

* `GET /api/resumes` lists the authenticated user's `READY` resumes and optionally
  includes archived records.
* `POST /api/resumes/uploads` validates metadata, active-resume quota, MIME type,
  and declared size; creates a `PENDING` record; and returns an object key and
  presigned upload URL valid for approximately five minutes.
* `POST /api/resumes/:id/complete` verifies the uploaded object and marks it `READY`.
* `GET /api/resumes/:id/download-url` verifies ownership and returns a presigned
  download URL valid for approximately five minutes.
* `PATCH /api/resumes/:id` updates only mutable metadata such as name, target role,
  notes, or archive status. It never replaces the stored file.
* `DELETE /api/resumes/:id` permanently removes an unreferenced resume and its R2
  object. A referenced resume must first be archived or explicitly removed from
  its applications; the API returns `409 Conflict` rather than silently unlinking it.
* `PUT /api/applications/:id/resume` accepts `{ "resumeVersionId": string | null }`,
  verifies that both records belong to the authenticated user, updates the
  association, and writes the corresponding activity event.

All list, read, update, delete, upload-completion, download, and association queries
must include `userId` in their database predicate.

### Upload Validation and Security

Resumes contain personal information and must be treated as sensitive private data.

* Require authentication before creating any upload or download URL
* Use a private bucket with no public object listing or public `r2.dev` access
* Generate unpredictable object keys on the server
* Keep presigned URLs short-lived and scoped to one object and one operation
* Bind the expected `Content-Type` when signing the upload request
* Verify the stored object size after upload; do not trust client metadata
* Validate the PDF magic bytes (`%PDF-`) before marking an upload `READY`
* Return downloads with `Content-Disposition: attachment` and the sanitized original filename
* Escape user-visible filenames and never use them as storage paths
* Rate-limit upload initiation, completion, and download-URL endpoints
* Do not log signed URLs, extracted resume text, or storage credentials
* Store R2 credentials only in backend environment variables
* Include resume records and metadata in account export
* Delete resume objects during full account deletion

Presigned upload URLs reduce server cost but do not replace completion-time
verification. The browser-provided MIME type, filename, and size are untrusted.

### Deletion and Versioning Semantics

Resume files are immutable. Uploading a revised file creates a new version; it does
not overwrite the object referenced by past applications.

* **Archive:** hides a resume from new application selectors but preserves existing
  application associations and the underlying file.
* **Permanent delete:** removes the database record and R2 object only when no
  applications reference it.
* **Account deletion:** deletes all of the user's resume objects before or alongside
  cascading database deletion.
* **Failed/abandoned upload:** deletes both the temporary object and incomplete
  database record after a short retention period.

### Resume Analytics

The first analytics iteration groups applied applications by `resumeVersionId` and
reports:

```text
Applications submitted
Applications receiving a response
Applications reaching an interview
Applications receiving an offer
Interview rate = applications with an interview / applications submitted
Offer rate = offers / applications submitted
```

Archived resumes remain in historical analytics. Metrics should display sample size
and avoid presenting a resume as definitively better when only a few applications
used it.

### Phased Implementation Plan

Each phase should be merged only after its exit criteria pass. Phases 0–4 make up
the upload-and-association MVP. Analytics and document enrichment build on that
stable lifecycle and should not block the initial release.

#### Phase 0: Storage and Data Foundations

Goal: establish the storage contract and database shape without exposing unfinished
functionality in the UI.

Implementation:

* Create a private `jobhazel-resumes` R2 bucket with public access disabled.
* Configure bucket CORS for the production and local frontend origins, allowing only
  the headers and `PUT`/`GET` methods required by presigned requests.
* Create an R2 API token restricted to the resume bucket.
* Add the S3-compatible SDK and presigning dependencies to the backend.
* Add and validate the resume environment variables during backend startup.
* Introduce a `resume-storage` service interface for presigning, inspecting, reading
  a small byte range, and deleting objects. Keep R2-specific code behind this
  interface so automated tests can use a fake storage adapter.
* Add `ResumeUploadStatus`, the new `ResumeVersion` metadata fields, indexes, and
  activity types through a Prisma migration.
* Audit existing `ResumeVersion` rows before removing `fileUrl`. If deployed data
  exists, use a transitional nullable migration, migrate or remove old records, and
  make required fields non-null in a follow-up migration.
* Regenerate the Prisma client and update account JSON export serialization for the
  new metadata fields without exporting storage credentials or signed URLs.

Tests and checks:

* Environment validation fails clearly when required R2 settings are absent in a
  production environment.
* Prisma migration works on both an empty database and a copy containing existing
  application data.
* The storage adapter can presign and inspect a test object without making the
  bucket public.

Exit criteria: the migrated backend starts successfully, the private bucket is
reachable through the storage adapter, and no existing application behavior changes.

#### Phase 1: Resume Upload and Download API

Goal: implement the authenticated backend lifecycle before building the UI.

Implementation:

* Add resume validators, routes, controllers, and services following the existing
  backend structure.
* Implement `GET /api/resumes` and user-scoped resume lookup.
* Implement `POST /api/resumes/uploads` to validate declared PDF metadata, enforce
  the active-resume quota, allocate the record and object key, and return a
  five-minute presigned `PUT` URL.
* Implement `POST /api/resumes/:id/complete` to inspect the object, enforce the true
  stored size, read enough bytes to verify `%PDF-`, and transition the owned record
  from `PENDING` to `READY`.
* Delete the uploaded object and mark or remove the record when completion validation
  fails.
* Implement `GET /api/resumes/:id/download-url` with ownership checks and a
  five-minute presigned `GET` URL.
* Implement metadata updates and archive/unarchive behavior in
  `PATCH /api/resumes/:id`; file replacement is not an update operation.
* Treat client checksums as a deduplication optimization, not as trusted security
  input. Confirm the checksum when the storage provider exposes a reliable value or
  when later processing reads the complete file.
* Normalize API errors for invalid type, oversized file, quota exceeded, duplicate
  file, missing object, invalid state transition, and access denied.

Tests and checks:

* Unit-test metadata validation, key generation, state transitions, and ownership
  predicates.
* Integration-test initiation, successful completion, invalid PDF cleanup, oversized
  object cleanup, expired/missing uploads, download authorization, quota enforcement,
  and cross-user access attempts using a fake storage adapter.
* Confirm that `PENDING`, `FAILED`, and archived records are excluded from the default
  list used by resume selectors.

Exit criteria: a resume can complete the full upload/download lifecycle through the
API, and no endpoint can expose or mutate another user's resume.

#### Phase 2: Resume Library UI

Goal: let users manage resume versions independently from applications.

Implementation:

* Add a `resumes` dashboard view and navigation item using the existing document
  icon.
* Add frontend resume types, API helpers, and loading/error state to the dashboard
  data flow.
* Build a resume library showing display name, target role, filename, size, creation
  date, archive status, and application usage count.
* Build an upload dialog with drag-and-drop/file selection, PDF and 5 MB client-side
  checks, editable display name, target role, and notes.
* Upload directly to the returned R2 URL, show progress/state, then call the
  completion endpoint. A failed direct upload must remain retryable or cleanly reset.
* Add authenticated download, rename, notes, archive, and unarchive actions.
* Clearly explain that uploading a revised file creates a new resume version.
* Keep incomplete uploads out of the normal library and provide actionable error
  messages rather than showing broken records.

Tests and checks:

* Component-test file selection, client validation, upload failure, completion
  failure, empty/loading/error states, metadata edits, and archive behavior.
* Manually verify upload and download against the development R2 bucket from the
  local frontend origin.
* Verify keyboard access, focus behavior, and screen-reader labels in the upload
  dialog and action menus.

Exit criteria: a signed-in user can upload, view, rename, download, archive, and
unarchive a resume without interacting with an application.

#### Phase 3: Application Association and History

Goal: record the exact resume version used for each job application.

Implementation:

* Implement `PUT /api/applications/:id/resume` with same-user validation for both
  records and support `null` to remove an association.
* Include selected resume summary data in application API responses without including
  a storage key or signed URL.
* Write `RESUME_ATTACHED`, `RESUME_CHANGED`, and `RESUME_REMOVED` activity events in
  the same transaction as the application update.
* Add a resume selector to the application create/edit drawer. Show only owned,
  `READY`, non-archived resumes for new selections while continuing to display an
  archived resume already associated with an application.
* Add the selected resume and authenticated download action to application details.
* Add application filtering by resume version, including a “No resume” filter.
* Warn, but do not block, when an application is moved to `APPLIED` without a resume.

Tests and checks:

* Test attach, replace, and remove operations and their activity events.
* Test cross-user resume association attempts and nonexistent or non-`READY` resume
  IDs.
* Test archived historical associations and the no-resume state.
* Regression-test application creation, editing, filtering, history, import
  conversion, and account export.

Exit criteria: every application can reliably identify and download its submitted
resume version, and every association change is visible in application history.

#### Phase 4: Lifecycle Hardening and MVP Release

Goal: prevent orphaned objects, uncontrolled usage, and privacy regressions before
the feature is released.

Implementation:

* Implement `DELETE /api/resumes/:id` with `409 Conflict` for referenced resumes and
  object deletion for unreferenced resumes.
* Add the permanent-delete confirmation UI and explain the difference between archive
  and delete.
* Add cleanup for abandoned `PENDING`/`FAILED` uploads using an R2 lifecycle rule or
  a scheduled authenticated backend job.
* Extend account deletion to enumerate and delete the user's R2 objects. Make the
  cleanup retryable so a transient R2 error cannot silently orphan private files.
* Apply endpoint rate limits and server-side active-resume quotas.
* Review logs and error reporting to ensure credentials, signed URLs, filenames, and
  extracted contents are not captured unnecessarily.
* Verify production bucket privacy, token scope, CORS origins, signed URL lifetime,
  and upload-size enforcement.
* Add storage usage and failed-cleanup observability so cost or orphan growth can be
  detected early.

Tests and checks:

* Exercise permanent deletion, referenced-record conflicts, account deletion,
  cleanup retry, abandoned uploads, and idempotent cleanup.
* Run the complete backend and frontend test suites.
* Complete a two-user manual security pass covering every resume endpoint and UI
  action.
* Verify that direct object URLs cannot access resumes after presigned links expire.

Exit criteria: all MVP behavior, cleanup paths, privacy controls, and regression tests
pass in a production-like environment. The resume upload MVP is ready to release at
the end of this phase.

#### Phase 5: Resume Performance Analytics

Goal: show how resume versions correlate with application outcomes.

Implementation:

* Add a backend aggregation grouped by `resumeVersionId` for submitted applications,
  responses, interviews, offers, interview rate, and offer rate.
* Include archived resumes in historical results and group deleted/no-resume data
  explicitly rather than dropping it silently.
* Add a resume analytics table with counts, rates, and clear sample sizes.
* Reuse the existing application and interview definitions so resume metrics agree
  with the rest of the analytics dashboard.
* Avoid ranking or declaring a winner below a documented minimum sample size.

Exit criteria: resume metrics reconcile with application-level data and remain
understandable when versions have small samples or no outcomes.

#### Phase 6: Parsing and Job Matching

Goal: add optional resume intelligence without coupling it to core storage.

Implementation:

* Extract searchable text from PDFs in an asynchronous job after upload completion.
* Track parsing status and failure separately from `ResumeUploadStatus`.
* Compare deterministic skills and keywords against saved job descriptions before
  introducing paid AI processing.
* Suggest the most relevant existing resume for an application, with reasons the
  user can inspect and override.
* Allow users to duplicate metadata into a new tailored resume version, while keeping
  the actual uploaded files immutable.
* Define retention and deletion rules for extracted text because it contains the
  same sensitive personal information as the source document.

Parsing failure must not make an otherwise valid uploaded resume unusable. File
storage and application association remain independent from optional enrichment.

Exit criteria: enrichment can fail or be disabled without affecting upload,
download, deletion, or application association behavior.

#### Phase 7: Generalized Application Documents (Optional)

Goal: support cover letters, portfolios, writing samples, and take-home submissions
only after resume-specific behavior is proven.

Implementation:

* Evaluate replacing the resume-specific relation with a broader `Document` and
  application-document join model.
* Preserve the exact submitted document version and document type.
* Revisit quotas, allowed file formats, malware controls, analytics, and retention
  independently for each document type.

Exit criteria: the broader model does not weaken resume history, privacy, deletion,
or cost controls.

### Resume Environment Variables

```env
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET_NAME="jobhazel-resumes"
R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
RESUME_UPLOAD_MAX_BYTES="5242880"
RESUME_ACTIVE_LIMIT="10"
RESUME_SIGNED_URL_TTL_SECONDS="300"
```

The frontend must never receive R2 access keys. It receives only presigned URLs for
individual uploads and downloads.

---