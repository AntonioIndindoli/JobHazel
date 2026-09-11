# JobHazel Chrome extension

Phases 1–3 are implemented. Clicking the toolbar icon captures the active job
page and opens JobHazel with a temporary capture ID. The app securely retrieves
the capture, preserves it through sign-in, and opens the existing import drawer.
Automatic draft creation remains Phase 4 work, so the user confirms **Create
draft** after reviewing the captured URL, title, and selected text.

## Build and load locally

Requires Node.js 20 or newer and Chrome 102 or newer.

```powershell
cd extension
npm ci
npm run build:dev
```

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**, select **Load unpacked**, and choose
   `extension/dist/development` from this repository.
3. Verify the extension ID is `nlbcijcaamjlllibnbkgmbeniaiagdkl`.
4. Start the frontend separately with `npm run dev` in `frontend/`.
5. Open an HTTP or HTTPS job posting, optionally highlight its description, then
   click **JobHazel (Development)**. It captures the page and opens
   `http://localhost:3000/?capture=<random-id>`.
6. If signed out, sign in in the opened tab. The capture remains in that tab and
   opens in the import drawer after authentication succeeds.
7. A green check means the full selection was captured. `URL` means no text was
   selected, `CUT` means a field was shortened to the backend limit, and `!`
   means capture failed. Hover over the extension icon for details and click it
   again to retry.
8. After code changes, rebuild and click **Reload** on the extension card.

Set this value in `frontend/.env.local` for the web-app bridge:

```dotenv
NEXT_PUBLIC_JOBHAZEL_EXTENSION_ID=nlbcijcaamjlllibnbkgmbeniaiagdkl
```

Restart the frontend after changing it. The configuration helper in
`frontend/app/lib/extension-config.ts` reads this build-time value and returns
`null` when absent or invalid. It never reads an extension ID from URL parameters.

## Build environments

| Command | Output directory | Toolbar destination | Allowed web-page matches |
| --- | --- | --- | --- |
| `npm run build:dev` | `dist/development` | `http://localhost:3000/` | `http://localhost/*`, `https://jobhazel.com/*` |
| `npm run build` | `dist/production` | `https://jobhazel.com/` | `https://jobhazel.com/*` |
| `npm run typecheck` | No emitted files | — | — |

Builds use TypeScript's compiler and local assets, with no remote runtime code.
The existing JobHazel PNG is reused for the manifest's icon sizes; Chrome scales
it for each surface. The manifest requests only `activeTab`, `scripting`, and
`storage`.

## Capture behavior

The extension reads only `window.location.href`, `document.title`, and the user's
current text selection in the main frame. It does not fall back to the page body,
read form fields, or monitor browsing in the background. HTTP and HTTPS pages are
supported; Chrome-internal pages show a retryable error.

Captures live in `chrome.storage.session` for 30 minutes. At most 10 pending
captures are kept, and expired or oldest excess records are pruned before a new
one is stored. Each record includes the destination tab ID for secure sender
checks. Closing Chrome clears session storage; an app tab opened before a browser
restart will therefore need a fresh capture.

URLs over 2,000 characters are rejected. Page titles and selected text are
bounded at 300 and 100,000 characters, respectively, with a `CUT` badge and a
warning stored in the capture. Empty selection is allowed and produces a `URL`
badge so the user knows review may require manual details.

Chrome's localhost match pattern does not constrain the port. The external
listener validates the exact sender origin against `ALLOWED_APP_ORIGINS`
(`http://localhost:3000` and `https://jobhazel.com` in development). Production
allows only `https://jobhazel.com`. Captures are exposed only through validated,
versioned retrieval and acknowledgment messages from the bound destination tab.

## Stable development identity and production release

`development-key.txt` contains a public RSA key used only in the development
manifest. Chrome derives a stable ID from it, independent of checkout path.
The private key was discarded and is not needed for unpacked development. Keep
the public key committed and unchanged so all developers use the same ID.

Production builds omit the development key and localhost configuration. Before
release, obtain the actual extension ID from the Chrome Web Store developer
dashboard, set `NEXT_PUBLIC_JOBHAZEL_EXTENSION_ID` in the frontend deployment,
and rebuild/deploy the frontend. Do not assume the development ID or a
path-derived production unpacked ID is the store ID. If a matching unpacked
production identity is needed, add the store-provided public key to the production
manifest configuration and verify its derived ID. Never commit a private key.

## Handoff contract

`src/protocol.ts` is the canonical version 1 extension contract. The frontend
keeps a structurally matching browser-safe type in
`frontend/app/lib/extension-bridge.ts` so its Next build does not traverse or
bundle extension source. Both sides validate untrusted messages at runtime.

| Message | Caller | Success response |
| --- | --- | --- |
| `jobhazel.capture` | Extension internal code only | `captureId` |
| `jobhazel.capture.retrieve` | Allowed JobHazel page | `capture` |
| `jobhazel.capture.acknowledge` | Allowed JobHazel page | `captureId` |

Requests and responses carry `version: 1`. Responses use `ok` as the success/error
discriminator. Errors have a typed `code` and a user-facing `message`. Requests
are plain JSON. The external listener and frontend bridge validate message
version, type, capture ID, payload fields, exact sender origin, and destination
tab at runtime.

`JobCapture` contains `captureId`, `createdAt` (Unix milliseconds), `sourceUrl`,
`sourceDomain`, `pageTitle`, and `rawText`. Capture IDs will be cryptographically
random. `CAPTURE_LIMITS` mirrors current backend character limits: 2,000 for URL,
255 for domain, 300 for title, and 100,000 for selected text. Phase 2 must reject
oversized URLs, derive the domain from the URL, and explain text truncation.

Retrieval must not consume a capture. The web page acknowledges only after it
preserves the payload locally; acknowledgment can then remove the extension's
copy. Repeated acknowledgments should be harmless. Payloads and auth tokens
must never be placed in the handoff URL; it carries only `?capture=<id>`.

The app stores a validated pending capture in the receiving tab's
`sessionStorage`, removes the capture query parameter after receipt, and clears
the pending data on cancellation, successful draft creation, sign-out, or
expiry. Retrieval errors stay visible in an app notice with retry guidance.

## References

- [Manifest key and extension identity](https://developer.chrome.com/docs/extensions/reference/manifest/key)
- [External messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [activeTab permission](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
