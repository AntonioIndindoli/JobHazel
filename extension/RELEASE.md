# Extension release checklist

## Application autofill in 0.1.6

The side panel now stores an editable contact profile per account and API environment in Chrome local storage. **Save details & autofill page** fills visible blank supported fields in the active tab, including accessible frames and open shadow roots, and reports counts. Existing answers are preserved. File uploads, screening questions, custom dropdowns, and submission remain manual. The profile can be cleared locally; signing out hides it and clears the displayed fields. Autofill needs no new permissions or backend changes.

Automated validation: TypeScript checking and all 61 extension tests pass, covering serialized page execution, controlled input events, native selects, hidden and disabled fields, unrelated questions, account isolation, worker sender validation, and the existing capture/save flow. Production packaging includes the new runtime modules. Live installed-extension validation remains outstanding: reload version 0.1.6, sign in, fill a real employer form with approved contact details, confirm answers survive moving to the next step, and review before submitting. Do not treat fixture results as universal ATS compatibility.

## Observed LinkedIn SDUI layout in 0.1.5

The authenticated page supplied by the user uses LinkedIn's newer SDUI layout, without the legacy description classes or heading tags used by 0.1.4. Capture now locates the semantic job-detail panel, reads its title link and company/location header, and extracts the whole `JobDetails_AboutTheJob_<id>` section. Requirements and lists outside the expandable introduction are included. Generated CSS class names are not used. The URL, title link, and description ID must agree, preventing a previous job's description from being paired with a new selection.

Live verification on October 9, 2026 executed the exact built production reader in the user's authenticated in-app browser. It captured Software Engineer I at Amplitude (4476906462, 7,917 characters), then New Grad, Software Engineer at Forage (4477648000, 5,073 characters), and then Amplitude again, using the job-list controls without reloading. Each capture identified the selected title, company, San Francisco location, description, and canonical job URL. The normal bounded-wait path was also verified live.

Local backend parsing of the live Amplitude capture exposed an additional salary issue: the first disclosure was Colorado's $125,000–$188,000 range. The parser now prefers a disclosure naming the selected job's city and excludes outside-city disclosures, yielding San Francisco's $138,000–$207,000 range. Structured salary precedence and unscoped salary parsing remain covered by regression tests. **This backend parser change must be deployed to affect production salary results.**

Both unpacked folders and `dist/releases/jobhazel-0.1.5.zip` are rebuilt. Type checking, all 42 extension tests, all 286 backend tests, the legacy and observed-SDUI capture-to-parser checks, and production ZIP validation pass. The full backend suite required access to its temporary localhost servers. The installed Chrome extension's authenticated import/save workflow, backend deployment, and store rollout remain outstanding release checks below.

Reload JobHazel once in `chrome://extensions` and confirm version **0.1.5** to activate the new page reader.

## Earlier LinkedIn panel capture in 0.1.4

Capture now reads the visible selected job detail panel on LinkedIn job pages. It sends the job title, company, location, job insights, and description with a canonical job URL, allowing the backend to parse the supplied text without fetching the LinkedIn search page. It ignores hidden panels and the left job list, reads fresh details for each invocation, and checks job identity and stable content during selection changes. Missing or stale details produce a retry message without storing a capture.

Both unpacked folders and `dist/releases/jobhazel-0.1.4.zip` are rebuilt. Type checking, all 36 extension tests, production package validation, and the fixture capture-to-backend-parser check pass. The latter confirms title, company, location, salary, description, skills, and the selected job URL with no server-side URL fetch. CI includes this check. No backend parser or API changes are required for this capture behavior. Existing backend deployment and store rollout requirements below still apply.

The 0.1.4 checks used a constructed legacy-layout fixture and did not verify the user's actual page. That implementation failed on the observed SDUI layout; 0.1.5 addresses that mismatch and adds live extraction evidence.

## Persistent page access in 0.1.3

Required HTTP/HTTPS website access replaces the optional per-site request introduced in 0.1.2. The panel can capture successive postings across sites and tabs without a toolbar click or address-bar request. Capture requests target the panel's own Chrome window and read the selected page at invocation time. Navigating does not capture automatically. New captures received during review are queued until the current draft is saved or discarded.

Both unpacked folders and `dist/releases/jobhazel-0.1.3.zip` are rebuilt. Type checking, all 25 extension tests, and ZIP validation pass. Regression checks cover cross-site navigation, switching tabs, capture retry, and the existing review/save workflow.

Existing installations need one Reload in `chrome://extensions` to activate the update. If Chrome retained restricted access, set **Details → Site access → On all sites** and accept any one-time permission confirmation. The browser owns this grant; the extension cannot override a restriction. Production connections remain restricted to `https://api.jobhazel.com` by the network policy. The actual Chrome runtime still needs a manual browser check; the installed Chromium runtime could not be launched earlier in this session.

## Verification on October 8, 2026

- Both extension builds, 20 extension regression tests, 283 backend tests, and production ZIP validation pass locally.
- Anonymous production probes pass app/API readiness, all five extension CORS preflights, auth route validation, and untrusted-origin rejection. The maximum capture probe returns **413**, so the backend changes still need deployment.
- The isolated SQL check now includes concurrent import conversion and rollback; it is configured to run in CI and was not run against a database locally during this change.
- An attempted Chromium runtime check could not launch the installed browser (`spawn UNKNOWN`). The authenticated Chrome checklist below remains unverified. Store publication and final-ID rollout remain pending.

## Build and automated checks

1. Run `npm ci`, `npm test`, and `npm run package` in `extension/`.
   With backend dependencies installed, also run `npm run verify:linkedin` to check captured LinkedIn panel text through the backend parser.
2. Run `npm test` in `backend/`. CI's isolated SQL atomic-save check also verifies concurrent import conversion and rollback. Deploy the API changes that make conversion atomic and permit up to 1 MB of import JSON, retaining the 100,000-character capture validation and the smaller limit on other routes. Include the city-specific salary parser correction from 0.1.5.
3. Run `npm run verify:production` from `extension/`. A 413 on the maximum-capture probe blocks release until the backend is updated.
4. Load `extension/dist/production` in Chrome and confirm **Connected to jobhazel.com** in the panel. Replace an existing development installation explicitly; Reload alone does not change its source folder.

CI tests both build environments, checks the production package, and uploads the generated ZIP. Source files, tests, local configuration, and private keys are excluded from the ZIP. The manifest public key is public metadata.

## Authenticated Chrome check

Use an authorized existing account:

- Sign in; confirm only `https://api.jobhazel.com` receives API requests.
- Select a description on a real posting and invoke the toolbar action. Review and edit every parsed field before saving.
- Save once and verify the application appears on `https://jobhazel.com` for the same account.
- Capture an already-saved posting; verify the duplicate warning and explicit override.
- Close and reopen the panel; verify the session restores. Sign out and sign back in.
- Interrupt connectivity during draft creation; reconnect and retry using the preserved controls.
- Capture a second posting while reviewing the first; confirm the first draft and edits stay intact. Save/discard before capturing another.
- Confirm version **0.1.5** and **Site access → On all sites**. Keep the panel open after saving, navigate to a posting on another site, and click **Capture current job**. Confirm review appears without a permission request or toolbar click. Repeat after switching to another tab, then invoke the toolbar action with the panel open after a save.
- In LinkedIn's two-pane job list, select a posting and capture without selecting text. Confirm title, employer, description, and `/jobs/view/<id>` match the open right-hand panel. Select a different job without reloading, capture again, and confirm its URL and description differ. Capture while the panel is updating; the extension must wait for matching details or offer a retry, preserving the current review.
- Retry a save whose response was lost; an already-converted draft must show that the application is saved.
- On other job sites, verify URL-only capture on a posting that blocks server-side fetching. If necessary, select the description and recapture.

## Chrome Web Store rollout

1. Upload the production ZIP as a draft. Obtain the store-issued public key and item ID before publication.
2. Rebuild with `JOBHAZEL_EXTENSION_PUBLIC_KEY` set to the dashboard public key. Verify the unpacked ID matches the item ID, then replace the draft package.
3. Deploy `EXTENSION_ORIGINS` including `chrome-extension://<store-id>`. The frontend extension ID is needed only for the optional legacy website handoff; the current panel saves directly and does not use external messaging.
4. Run `npm run verify:production -- <store-id>` and repeat the authenticated Chrome check with the final package.
5. Supply listing screenshots, support contact, privacy-policy URL and data-use disclosures consistent with [the README](README.md). Local capture expiry does not imply automatic deletion of server-side drafts or account data.
6. Complete store review and verify the public installation before announcing availability.

Chrome documents how to obtain and compare the [store public key and extension ID](https://developer.chrome.com/docs/extensions/reference/manifest/key).
