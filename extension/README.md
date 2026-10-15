# JobHazel Chrome extension

Capture a posting, sign in to JobHazel in the Chrome side panel, review the draft, and save it to your account. The review form includes a Resume version selector from your account's completed, active resumes, with an optional No resume choice. Upload new PDFs in JobHazel's Resumes library. Saving attaches the selected version in the same transaction as the imported application; deploy the backend import change before using this selector. Capturing does not navigate the posting. **Open in JobHazel** and **Create an account** open the website only when clicked.

## Autofill job applications

Sign in, open the employer's application form, and expand **Your autofill details** in the side panel. Account name and email are supplied initially; add your first/last name, phone, address, LinkedIn, and portfolio as needed. Click **Save details & autofill page**. Repeat after moving to the next application step or loading more fields.

Autofill fills visible blank contact fields identified by standard labels, ARIA labels, field names, or autocomplete attributes. Native dropdowns require an exact option label or value match. Existing answers stay intact. Accessible embedded frames and open shadow roots are supported; custom dropdowns, closed shadow roots, resume uploads, screening questions, and submission remain manual. The result reports filled fields, existing answers kept, and recognized fields needing manual input. Always review before submitting. Real employer forms still need manual browser validation; DOM fixtures cover the supported behavior.

Details are stored in Chrome local storage separately for each account and API environment, not synced to JobHazel. Signing out hides and clears the displayed details but retains the saved profile for your next sign-in. **Clear saved autofill details** removes it from this browser. Only the allowlisted profile fields are passed to the page on an explicit autofill click; no auth credentials are passed. The page can read filled values as with manual typing. No additional extension permissions or backend deployment are required for autofill.

## Use the production API

From `extension/`:

```sh
npm ci
npm test
npm run package
npm run verify:production
```

In `chrome://extensions`, enable Developer mode and load **`extension/dist/production`** unpacked. If you previously loaded `extension/dist/development`, remove that unpacked copy and load the production folder. Chrome's Reload button reloads the same folder; building production does not switch an existing development installation.

The production panel says **Connected to jobhazel.com**. Its API is `https://api.jobhazel.com`, and its network content security policy restricts connections to that API. Required website access lets **Capture current job** read postings on different sites while the panel stays open. The generated ZIP is `extension/dist/releases/jobhazel-<version>.zip` and contains runtime files only. Packaging checks the built configuration, permissions, policy, version, and absence of local endpoints.

After updating, reload JobHazel once in `chrome://extensions` and confirm version **0.1.6**. In **Details → Site access**, choose **On all sites** if Chrome retained a restricted setting. Accept any one-time Chrome permission confirmation. You can then move between sites and use capture and autofill from the panel. Chrome controls this setting; see [Chrome's site-access instructions](https://support.google.com/chrome/answer/2664769#extensionpermissions).

Sessions are scoped to their API URL. Upgrading from the older unscoped session format requires one sign-in; a development credential is never reused against production. Temporary connection failures preserve the session and capture, and let you retry.

The deployed API must include the capture body-size fix before release. `verify:production` checks public readiness, extension CORS and auth route availability, origin rejection, and the maximum capture size using anonymous requests. It creates no accounts, drafts or applications and sends no email. It does not replace signing in and saving with an authorized test account in Chrome. See [the release checklist](RELEASE.md).

## LinkedIn job lists

Select a job in LinkedIn's list so its details appear in the right-hand panel, then click **Capture current job** in JobHazel. No text selection is needed. Capture reads that panel's title, company, location, job insights, and description, and uses the selected posting's canonical `/jobs/view/<id>/` URL. It excludes the left job list and unrelated page sections.

Each capture reads the current DOM, so selecting another job without reloading works. The reader waits briefly for matching job details to settle and rejects a panel that still identifies the previous job. If no selected job can be identified, the panel preserves retry controls instead of importing the search page. Sites without a dedicated reader retain their URL/title/selected-text capture behavior.

Version 0.1.5 supports the observed LinkedIn SDUI layout using its semantic job-detail attribute and `JobDetails_AboutTheJob_<id>` section, alongside the older layout. It reads the entire description, including requirements and lists outside the expandable introduction, without depending on generated CSS class names. The backend prefers a salary disclosure that names the selected job's city when multiple regional ranges are present; deploy that parser change to enable it in production.

`npm test` checks LinkedIn DOM fixtures, including a reduced copy of the user's actual SDUI markup, hidden panels, changed selection, and delayed rendering. After installing both extension and backend dependencies, `npm run verify:linkedin` checks both layouts through the backend parser, with no URL fetch or account changes. CI runs this check. On October 9, 2026, the exact production reader was also executed against the authenticated live LinkedIn page in the in-app browser: Amplitude → Forage → Amplitude captured distinct titles, companies, descriptions, and canonical job IDs without reloading. Local parsing of the Amplitude capture confirmed its San Francisco salary range. This verifies live extraction and local parsing; the installed Chrome side-panel import/save workflow remains a separate release check.

## CareerTakes job pages

Capture current job reads the loaded `/jobs/apply/?id=...` job card automatically, including its title, client employer, location, tags, summary, and full description. It waits briefly for rendering and rejects missing, hidden, busy, or mismatched cards. Header signup links, match-score promotions, salary widgets, and the legal footer are excluded.

URL-only imports use the same public `/files/jobs/<id>.json` resource requested by CareerTakes' page. The backend verifies the job ID and reads the selected posting's fields. If the resource is unavailable, it leaves missing details empty instead of treating the footer as a posting. Deploy the backend change for URL imports; reload the rebuilt extension for browser capture. Existing drafts need to be discarded and captured again.

`npm test` covers the supplied rendered HTML, delayed loading, renamed CSS module classes, and stale cards. With backend dependencies installed, `npm run verify:careertakes` verifies the production capture through the backend parser offline. Backend parser tests cover URL-only imports and failed or mismatched public data responses.

## ByteDance job pages

On `joinbytedance.com/search/<job-id>`, **Capture current job** reads the loaded posting without selecting text. It captures the title, ByteDance employer, location, employment type, responsibilities, qualifications, compensation, and company information. It waits for rendering, checks the apply button's job ID against the URL, and rejects stale or incomplete content. Navigation, sharing controls, and the footer are excluded.

URL-only imports extract the same fields from the server's streamed HTML, even when the job arrives after the footer. Deploy the backend changes and reload the rebuilt extension, then discard the old draft and capture again. `npm test` covers the rendered DOM and loading states; `npm run verify:bytedance` verifies production capture through the backend parser offline with both sets of dependencies installed.

## Local development

1. Start the backend on `http://localhost:4000` with current migrations.
2. Allow `chrome-extension://nlbcijcaamjlllibnbkgmbeniaiagdkl` in backend `EXTENSION_ORIGINS`.
3. Run `npm run build:dev` and load `extension/dist/development` unpacked.
4. Open a posting, optionally select the description, and click the JobHazel toolbar icon.
5. Sign in, review, and save in the panel.

The development build is named **JobHazel (Development)**, displays its local API URL, and restricts network connections to `http://localhost:4000`. It has the same persistent website access as production. Both unpacked builds use the checked-in public key and ID `nlbcijcaamjlllibnbkgmbeniaiagdkl`; Chrome treats them as the same extension. Switch the loaded folder explicitly when changing environments.

`npm run verify:local` requires a development API and a disposable verified account compatible with its auth setup; it must not be used against production. The existing script's signup workflow predates managed email verification, so use the anonymous production probes plus the manual authenticated checklist for release validation.

## Store identity

The unpacked key does not establish the final Chrome Web Store identity. After the first draft upload, obtain the dashboard public key, set `JOBHAZEL_EXTENSION_PUBLIC_KEY` when building production, and rebuild. Confirm the derived ID matches the dashboard and add `chrome-extension://<store-id>` to production `EXTENSION_ORIGINS`. To probe the final origin, run `npm run verify:production -- <store-id>`. See [Chrome's public-key workflow](https://developer.chrome.com/docs/extensions/reference/manifest/key).

## Permissions and data

- Required website access (`*://*/*`) and `scripting`: read the current posting's URL and title, the selected LinkedIn, CareerTakes, or ByteDance job detail content, or manually selected text on other sites when capture is invoked. Persistent access supports arbitrary job sites from the open panel.
- `storage`: hold pending captures in session storage and the signed-in session and account-specific autofill profile in local storage.
- `sidePanel`: show sign-in and job review alongside the posting.
- The website permission also covers the API; `connect-src` restricts network connections to the selected JobHazel API.

Capture uses required host permissions instead of temporary `activeTab` access or optional per-site requests. There is no address-bar request flow. The extension captures only when invoked from the panel or toolbar; navigating to a page does not trigger capture. New captures are reviewed after the previous application is saved or discarded; removing a saved capture never reopens it. Chrome's own pages cannot be captured. See [Chrome's host-permission documentation](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions#host_permissions).

Capture reads the selected LinkedIn, CareerTakes, or ByteDance job's detail content or manually selected text on other sites. Autofill checks supported fields locally to preserve existing answers and fills blanks from your profile; field values are not sent to JobHazel. The extension does not read browsing history or job-board credentials. Captured text is limited to 100,000 characters. Pending local captures expire after 30 minutes and are removed after saving or discarding; Chrome also clears session storage on restart/reload. Once sent to JobHazel, import drafts and saved applications remain account data under the website's retention and deletion behavior. Signing out revokes the session and removes the stored credential after the server confirms the request.
