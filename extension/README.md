# JobHazel Chrome extension

Phase 1 scaffold. Clicking the toolbar icon opens JobHazel. Capturing job text,
external messaging, and automatic import review are planned for Phases 2–4.

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
4. Pin **JobHazel (Development)** and click it. It opens `http://localhost:3000/`.
   Start the frontend separately with `npm run dev` in `frontend/`.
5. After code changes, rebuild and click **Reload** on the extension card.

Set this value in `frontend/.env.local` for the future web-app bridge:

```dotenv
NEXT_PUBLIC_JOBHAZEL_EXTENSION_ID=nlbcijcaamjlllibnbkgmbeniaiagdkl
```

Restart the frontend after changing it. The configuration helper in
`frontend/app/lib/extension-config.ts` reads this build-time value and returns
`null` when absent or invalid. It never reads an extension ID from URL parameters.
The bridge itself is Phase 3 work.

## Build environments

| Command | Output directory | Toolbar destination | Allowed web-page matches |
| --- | --- | --- | --- |
| `npm run build:dev` | `dist/development` | `http://localhost:3000/` | `http://localhost/*`, `https://jobhazel.com/*` |
| `npm run build` | `dist/production` | `https://jobhazel.com/` | `https://jobhazel.com/*` |
| `npm run typecheck` | No emitted files | — | — |

Builds use TypeScript's compiler and local assets, with no remote runtime code.
The existing JobHazel PNG is reused for the manifest's icon sizes; Chrome scales
it for each surface. The manifest requests only `activeTab`, `scripting`, and
`storage`. Capture/storage permissions are reserved for the next phase.

Chrome's localhost match pattern does not constrain the port. The future external
listener must validate the exact sender origin against `ALLOWED_APP_ORIGINS`
(`http://localhost:3000` and `https://jobhazel.com` in development). Production
allows only `https://jobhazel.com`. Neither build currently registers an external
message listener or exposes captured data.

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

`src/protocol.ts` is the canonical version 1 contract. The frontend can use a
type-only import from it when the bridge is implemented; do not copy the types.

| Message | Caller | Success response |
| --- | --- | --- |
| `jobhazel.capture` | Extension internal code only | `captureId` |
| `jobhazel.capture.retrieve` | Allowed JobHazel page | `capture` |
| `jobhazel.capture.acknowledge` | Allowed JobHazel page | `captureId` |

Requests and responses carry `version: 1`. Responses use `ok` as the success/error
discriminator. Errors have a typed `code` and a user-facing `message`. Requests
are plain JSON. TypeScript types do not validate messages at runtime: Phase 3
must validate untrusted input and check both sender origin and destination tab.

`JobCapture` contains `captureId`, `createdAt` (Unix milliseconds), `sourceUrl`,
`sourceDomain`, `pageTitle`, and `rawText`. Capture IDs will be cryptographically
random. `CAPTURE_LIMITS` mirrors current backend character limits: 2,000 for URL,
255 for domain, 300 for title, and 100,000 for selected text. Phase 2 must reject
oversized URLs, derive the domain from the URL, and explain text truncation.

Retrieval must not consume a capture. The web page acknowledges only after it
preserves the payload locally; acknowledgment can then remove the extension's
copy. Repeated acknowledgments should be harmless. Payloads and auth tokens
must never be placed in the handoff URL; it carries only `?capture=<id>`.

## References

- [Manifest key and extension identity](https://developer.chrome.com/docs/extensions/reference/manifest/key)
- [External messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [activeTab permission](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
