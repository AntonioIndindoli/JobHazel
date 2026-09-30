# Browser regression suite

Run `npm run test:e2e` from `frontend` after installing dependencies in both packages and running `npx playwright install chromium`.

Set `E2E_DATABASE_URL` and `E2E_DATABASE_HOST` to the exact hostname of a migrated, isolated PostgreSQL database. For local/CI use database name `jobhazel_e2e`. Apply migrations with the backend Prisma CLI before starting. Never use production; the known JobHazel production endpoint is explicitly rejected. No URL is inferred from your development `.env`.

The suite starts the real Express API on port 4100 and the Next app on port 3100. The app uses `.next-e2e` so it can coexist with a development server. Both ports must be free. Chromium runs desktop and Pixel 7 layouts. Tests cover signup/OTP rejection/recovery, HttpOnly login and reload/logout, application CRUD, import review, resume upload/attachment/download, and interview rescheduling with its generated task.

Only remote auth and object storage are simulated in a test-only executable; API routes, middleware, validation, Prisma queries, and browser requests are real. Backend outbound fetches are blocked except the simulated provider. Email never leaves the test server. Provider integration scripts remain necessary to validate live authentication, R2 CORS/privacy, and scheduled delivery.

Each run uses unique accounts and deletes only the local accounts created in that process during teardown. A token-protected localhost cleanup route supports Windows process shutdown. Forced termination before teardown can leave those test accounts on the isolated database; prefer a disposable database/branch. CI provisions a fresh PostgreSQL service and retains failure traces for seven days.

The GitHub workflow runs backend tests, frontend lint/tests/build, extension tests/typecheck, and both browser projects. It needs no cloud credentials. Enable its required status in repository branch protection after the workflow is pushed.
