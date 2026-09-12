# JobHazel Chrome extension

The extension captures a job posting and opens a dedicated Chrome side panel. Users sign in to JobHazel inside the panel, review the parsed draft, edit its fields, and save the application to their account. Capturing never opens or navigates a browser tab.

After a successful save, **Open in JobHazel** is available as an explicit action. Creating an account is also a user-initiated link from the sign-in screen.

## Local development

1. Start the backend on `http://localhost:4000` and apply current Prisma migrations.
2. Set `EXTENSION_ORIGINS="chrome-extension://nlbcijcaamjlllibnbkgmbeniaiagdkl"` in the backend environment.
3. Run `npm run build:dev` in `extension/`.
4. Open `chrome://extensions`, enable Developer mode, and load `extension/dist/development` unpacked.
5. Open a job posting, optionally select its description, and click the JobHazel toolbar icon.
6. Sign in inside the side panel, review the draft, and click **Save application**.

The development build uses the stable extension ID `nlbcijcaamjlllibnbkgmbeniaiagdkl`. It calls `http://localhost:4000`. The production build calls `https://api.jobhazel.com` and uses the same public manifest key so its extension origin remains stable.

## Runtime permissions

- `activeTab`: access only the tab where the user invokes JobHazel.
- `scripting`: read the current page URL, title, and selected text.
- `storage`: retain pending captures and the extension session.
- `sidePanel`: display the authenticated review UI alongside the posting.
- API host access: call the JobHazel authentication and import endpoints.

No page body, form fields, browsing history, or job-board credentials are captured. Selected text is limited to 100,000 characters. Captures expire after 30 minutes and are removed after saving or discarding.

## Commands

```sh
npm run typecheck
npm test
npm run build
npm run verify:local
```

`npm run verify:local` requires the development API at `http://localhost:4000`. It verifies extension CORS, authentication and refresh, idempotent capture/draft handling, saving, duplicate confirmation, and account visibility with a disposable account that it removes after the run.

Production deployment must allow the final `chrome-extension://<extension-id>` origin through the backend `EXTENSION_ORIGINS` setting.
