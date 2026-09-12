# Chrome Extension Implementation Plan

Status: Phases 1–5 implemented and automated/live API verification completed; manual Chrome UI validation pending
Created: September 10, 2026

## Objective

Let a user highlight a job description, click the JobHazel extension, review the captured information inside the extension, and save it to their pipeline without leaving the posting. Reuse the backend parsing, import, and duplicate-detection services.

The MVP captures information only after a user action. Automatic applications, background browsing monitoring, and job-board account synchronization are outside this plan. The extension requires its own authenticated session before it creates or saves drafts.

## Existing foundation

These parts already exist in the repository:

| Capability | Location |
| --- | --- |
| Authenticated import endpoints | `backend/src/routes/imports.routes.js` |
| Draft creation, parsing integration, duplicate detection, and conversion | `backend/src/services/imports.services.js` |
| Input validation and payload limits | `backend/src/validators/import.validators.js` |
| Job parsing | `backend/src/services/parser.services.js` |
| Import review UI | `frontend/app/components/ImportDrawer.tsx` |
| Authenticated import request handlers | `frontend/app/page.tsx` |

The actual backend routes are `POST /imports/create-draft`, `GET /imports/:id`, and `POST /imports/:id/convert`, relative to the configured API base. Use the existing frontend request helper rather than assuming the README's `/api` prefix.

## Implemented flow

1. The user opens a job posting and optionally highlights its description.
2. The extension captures the URL, title, source domain, and selected text.
3. The service worker opens the dedicated Chrome side panel and stores the capture temporarily under a random ID.
4. If needed, the side panel asks the user to sign in and preserves the pending capture during authentication.
5. The authenticated extension creates an idempotent import draft and displays the parsed fields in its own review form.
6. The user corrects fields and confirms saving.
7. The existing conversion endpoint creates the application in the user's account.
8. After success, an explicit **Open in JobHazel** button can open the web application.

Capturing never creates or navigates a browser tab. Access and rotating refresh tokens are kept in extension-only storage and never placed in URLs.

## Phase 1 — Scaffold the extension and define the handoff

### Tasks

- [x] Create a standalone `extension/` TypeScript package with build and type-check scripts.
- [x] Add a Manifest V3 manifest, toolbar action, service worker, and extension icons.
- [x] Request `activeTab`, `scripting`, and `storage`; avoid broad job-site host permissions.
- [x] Define production and local development builds with explicit app URLs.
- [x] Configure `externally_connectable` for the production JobHazel origin and a development-only localhost origin.
- [x] Establish a stable extension ID for local development and a frontend configuration value for the installed extension ID. Document the production ID update during release.
- [x] Define versioned capture, retrieval, acknowledgment, and error message types.
- [x] Document building and loading the unpacked extension.

### Capture contract

```ts
type JobCapture = {
  version: 1;
  captureId: string;
  createdAt: number;
  sourceUrl: string;
  sourceDomain: string;
  pageTitle: string;
  rawText: string;
};
```

Match current backend limits: URL 2,000 characters, domain 255, title 300, and selected text 100,000. Reject oversized URLs and visibly explain any text truncation. Derive the domain from the captured URL.

### Acceptance criteria

- The build produces an unpacked extension that Chrome can load.
- Production configuration excludes localhost.
- The frontend can identify the intended extension without accepting an arbitrary extension ID from a URL parameter.

### Implementation verification

Implemented September 10, 2026. Both development and production builds and TypeScript checks pass. Frontend configuration lint passes. Build checks verified manifest assets, permissions, production origin isolation, and toolbar behavior with a Chrome API stub. Loading the unpacked build in an actual Chrome session remains a manual check; see extension/README.md.

## Phase 2 — Capture job context from the active tab

### Tasks

- [x] On toolbar invocation, use `chrome.scripting.executeScript()` to capture `document.title`, the current URL, and `window.getSelection()?.toString()` from the main frame.
- [x] Accept only HTTP and HTTPS pages and handle injection failures with a useful message.
- [x] Allow URL/title-only captures when no text is selected; explain that review may require manual details.
- [x] Do not capture the entire page body, form fields, or account information as a fallback.
- [x] Generate a cryptographically random capture ID and store the bounded payload in `chrome.storage.session`.
- [x] Set a capture expiry, initially 30 minutes, prune expired entries during capture, and expose the same pruning helper for Phase 3 retrieval. Bound the number of pending captures and handle storage-quota failures.
- [x] Open the configured JobHazel URL after storage succeeds.
- [x] Provide clear capture success and failure feedback, with a way to retry.

### Acceptance criteria

- A normal job page produces the expected payload with and without highlighted text.
- Restricted pages such as `chrome://extensions` fail gracefully.
- Captures survive service-worker suspension within the current browser session.
- Browser restart or capture expiry produces an explicit recapture message.

### Implementation verification

Implemented September 10, 2026. Development and production builds pass TypeScript checks. Six focused tests verify URL/domain normalization, empty selections, field limits and warnings, unsupported pages, stored-record validation, expiry, malformed-record cleanup, and the 10-capture bound. Manifest smoke checks confirm the requested permissions, absence of broad host permissions, and exclusion of localhost from production.

The service worker binds each stored capture to a newly created destination tab before navigating that tab to JobHazel, avoiding a retrieval race. Chrome UI checks remain part of the manual validation.

## Phase 3 — Connect the extension to JobHazel

### Tasks

- [x] Add an external message listener that validates the sender's exact origin, message version, message type, and capture ID.
- [x] Restrict retrieval to the destination tab created for that capture; reject other tabs and origins.
- [x] Implement separate retrieval and acknowledgment operations. Reading a capture must not immediately delete it.
- [x] Add a small frontend bridge module for extension messaging, timeouts, validation, and typed errors.
- [x] Detect the `capture` parameter on app entry and retrieve the pending payload.
- [x] Preserve the validated capture in the receiving tab's `sessionStorage` before acknowledging receipt to the extension.
- [x] Remove the capture parameter with `history.replaceState` after successful receipt.
- [x] Preserve pending data across the existing sign-in flow. Do not create a draft before authentication completes.
- [x] Clear temporary data on successful handoff to a draft, cancellation, expiry, or sign-out. An expired payload must not silently attach to another account.
- [x] Handle a missing extension, mismatched extension ID, missing capture, and messaging failure with recovery instructions.

### Acceptance criteria

- Signed-in users receive their capture automatically.
- Signed-out users can sign in and resume the same capture.
- Reloading the receiving tab preserves an unexpired pending capture.
- Unauthorized origins and unrelated tabs cannot retrieve captures.
- No web-app access or refresh token is sent to or stored by the extension.

### Implementation verification

Implemented September 10, 2026. Ten extension tests cover exact-origin authorization, message validation, destination-tab enforcement, separate retrieval and idempotent acknowledgment, expiry cleanup, and the Phase 2 capture behavior. Eight frontend bridge tests cover payload validation, store-before-acknowledge ordering, blocked browser storage, missing or unreachable extensions, typed protocol errors, tab-local expiry, cleanup, URL sanitization, and reload-safe draft references.

Frontend lint, TypeScript, and the optimized production build pass. The app shows capture and recovery notices, resumes a tab-local capture after sign-in or reload, and opens the populated capture step without creating a backend draft. A real unpacked-Chrome sign-in and reload walkthrough remains the manual validation step.

## Phase 4 — Reuse draft creation and review

### Tasks

- [x] Extract a reusable draft-creation function from the current form handler in `frontend/app/page.tsx` so manual imports and extension captures share the same behavior.
- [x] Submit only `sourceUrl`, `sourceDomain`, `pageTitle`, and `rawText` through the existing authenticated request helper.
- [x] Open `ImportDrawer` with the returned draft, parsed fields, and duplicate candidates.
- [x] Show recoverable parsing and network errors while preserving the capture for retry.
- [x] Prevent duplicate draft submissions caused by rerenders, repeated messages, or refreshes; retain the resulting draft ID for resumption.
- [x] Define retry behavior for an ambiguous network failure. Automatic retries are disabled; manual retry uses a user-scoped backend idempotency key carried in the `Idempotency-Key` header.
- [x] Preserve the existing conversion endpoint and review-before-save behavior.
- [x] Verify duplicate and already-converted responses leave the UI in a usable state.

### Acceptance criteria

- A captured posting reaches the existing editable review drawer.
- Confirming creates one application in the signed-in user's pipeline.
- Duplicate candidates are shown before an accidental second application is created.
- Cancelling review creates no application.
- Manual URL and text imports continue to work.

### Implementation verification

Implemented September 10, 2026. Captures now create a draft automatically after authentication and transition directly to the editable review step. Manual imports call the same API helper. The request body contains only the four capture fields; extension requests send the random capture ID as an `Idempotency-Key` header.

`ImportDraft.captureId` is nullable and unique per user. The backend returns an existing draft for repeated keys and handles concurrent unique-key races, preventing reloads or repeated delivery from creating duplicate drafts. After creation, the browser replaces raw capture text with a short draft reference and restores the user-scoped draft through `GET /imports/:id`, including current duplicate candidates.

Network and parsing failures remain visible in the drawer without discarding the capture. Conversion retries reconcile an already-converted draft by closing the drawer and refreshing applications, while duplicate responses remain in review with an inline warning. Prisma generation, the optimized frontend build, lint, 29 frontend tests, 78 backend tests, and 10 extension tests pass. The database migration must be applied in each environment before deploying the updated backend.

## Phase 5 — Verify the complete workflow

### Side-panel revision completed September 10, 2026

- [x] Replace the automatic web-app tab handoff with a Manifest V3 side panel.
- [x] Add extension login, rotating refresh, logout, and backend CORS configuration.
- [x] Create and restore idempotent drafts inside the extension.
- [x] Add editable review, duplicate override, and application conversion inside the extension.
- [x] Show **Open in JobHazel** only after an application is saved.
- [x] Add an automated assertion that toolbar capture never calls `chrome.tabs.create()`.

### Automated checks

- [x] Test capture validation, unsupported pages, payload limits, storage expiry/pruning, and side-panel messaging.
- [x] Test the frontend bridge with missing-extension, timeout, malformed-payload, and success responses.
- [x] Verify extension sign-in, rotating refresh, idempotent draft replay, draft restore, save, duplicate warning, explicit duplicate override, and application visibility against the running development API.
- [x] Verify import request validation and user-scoped authentication through backend tests and the disposable-account live workflow.
- [x] Add a repeatable `npm run verify:local` integration check that creates and removes its own disposable account.
- [x] Run extension type checks/tests and production build, backend tests, and frontend tests and production build.

### Verification result — September 11, 2026

The live workflow passed all ten API checks against `http://localhost:4000`. It uncovered a database constraint that rejected the explicit **Save this job anyway** path with HTTP 500. The application schema now uses a non-unique lookup index for `(userId, sourceUrl)`, while duplicate detection and confirmation remain in the import service. Migration `20260911230000_allow_duplicate_application_source_urls` was applied to the configured development database and the full workflow passed after the fix.

Automated results: 12 extension tests, 79 backend tests, and 34 frontend tests passed. Development and production extension builds and the optimized frontend build also passed. The live check deletes its generated account after every run.

### Manual Chrome checks

| Scenario | Expected result |
| --- | --- |
| LinkedIn, Indeed, Greenhouse, Lever, Workday, and a company career page | URL/title capture works where Chrome permits access; highlighted text reaches review |
| No highlighted text | Review remains available with manual correction if parsing is incomplete |
| Signed out | Sign-in resumes the pending capture |
| Restricted browser page | Clear error without opening a broken import |
| Duplicate posting | Existing duplicate warning is displayed |
| API unavailable | Retry is possible without losing captured text |
| Two separate captures | Each receiving tab imports its own payload |
| Refresh during handoff or review | No unintended duplicate creation |
| Expired capture or browser restart | Clear instruction to capture again |
| Oversized selected text | Bounded payload and visible explanation |

The automated live check creates a unique disposable account and deletes it when the run finishes. Manual checks should use a separate local test account.

### Acceptance criteria

- All critical capture-to-save scenarios pass in a real Chrome session.
- Newly introduced failures have reproducible tests or documented manual checks.
- The local app still supports its existing import flow.

## Phase 6 — Package and release

### Tasks

- [ ] Build a production ZIP containing only runtime files and required assets.
- [ ] Prepare the extension description, screenshots, icons, support link, and privacy disclosure describing captured fields and temporary retention.
- [ ] Verify current Chrome Web Store publishing and data-use requirements before submission.
- [ ] Confirm the production extension ID and deploy matching frontend configuration.
- [ ] Smoke-test the packaged extension against the deployed JobHazel app.
- [ ] Submit the package through the project owner's Chrome Web Store account when publication is authorized.
- [ ] After approval, replace the README's planned extension setup and demo text with working installation instructions and a store link.
- [ ] Keep manual imports available as the fallback if extension messaging fails or the extension is unavailable.

### Acceptance criteria

- The production package works with `https://jobhazel.com` and contains no development origins or secrets.
- Installation and support instructions match the released build.
- Public availability is verified before announcing the extension as released.

## Suggested implementation order

Complete Phases 1–4 as the first working vertical slice, then finish Phase 5 before packaging or publication. No new database model is expected for the basic capture flow; backend idempotency may require a small persistence change if adopted.

Future enhancements can include structured `JobPosting` metadata extraction, a selection context-menu action, and authenticated one-click saving. Evaluate those after the review-based MVP is reliable.

## Technical references

- [Chrome activeTab permission](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Chrome scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [Extension and web-page messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Chrome storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
