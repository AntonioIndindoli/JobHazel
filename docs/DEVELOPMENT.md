# Local development

[Project overview](../README.MD) · [Implementation notes](IMPLEMENTATION.md) · [API reference](API.md)

Use **Node.js 22**, npm, and PostgreSQL. The web app, API, and Chrome extension are separate packages; install their dependencies individually.

## Preview the dashboard

To view the sample dashboard without an account or backend, run from the repository root:

```sh
npm --prefix frontend ci
npm --prefix frontend run dev
```

Open [localhost:3000/dashboard-preview](http://localhost:3000/dashboard-preview). This route uses fictional data. The full application requires the API and managed authentication described below.

## Environment files

Copy [backend/.env.example](../backend/.env.example) to `backend/.env` and [frontend/.env.example](../frontend/.env.example) to `frontend/.env.local`. Keep any existing local configuration.

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection used by the API. |
| `DATABASE_URL_UNPOOLED` | Direct connection used for migrations; Prisma falls back to `DATABASE_URL` if absent. |
| `NEON_AUTH_BASE_URL` | Managed Auth endpoint for the same Neon branch as the application's database. Needed for signup and login. |
| `AUTH_RATE_LIMIT_SECRET` | Stable, random secret used to hash authentication rate-limit keys. Use at least 32 characters. |
| `APP_URL`, `CORS_ORIGIN` | Web origin; both default to `http://localhost:3000`. |
| `NEXT_PUBLIC_API_BASE_URL` | Frontend API address; use `http://localhost:4000` for the local API. |

For full account workflows, use a development Neon branch with Auth configured and the local app origin trusted. Neon Auth handles verification codes, recovery emails, passwords, and sessions. See [the Auth integration and migration notes](../backend/NEON_AUTH_MIGRATION.md).

### Optional local PostgreSQL

For database development without managed sign-in, the included Docker service provides PostgreSQL on port `55489`, with database `jobappledger`. From the repository root:

```sh
docker compose -f infra/docker-compose.yml up -d
```

The backend example's database URLs match this service. Set `NEON_AUTH_BASE_URL` empty for this mode. Docker does not provide Neon Auth; use a Neon branch for real account workflows, or the browser test suite's simulated provider for automated workflows.

### Optional resume storage

Supply all five R2 values to enable resume upload/download: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, and `R2_ENDPOINT`. Keep the bucket private and allow the frontend origin in its [CORS configuration](../infra/cloudflare/r2-cors.json).

For development without storage, leave **all five values empty**. Clear the example's bucket and endpoint placeholders too. Partial configuration fails startup validation; upload/download operations require a configured provider.

### Optional reminder emails

`RESEND_API_KEY` and a verified `EMAIL_FROM` sender are for application reminder emails. They do not configure Neon Auth's account emails.

Reminder delivery also needs public app/API origins, signing secrets, and a scheduler. See [notification configuration and operations](../backend/NOTIFICATIONS.md) before enabling it. In-app follow-up tasks can be used independently of email delivery.

## Start the API

After configuring `backend/.env`, run from `backend/`:

```sh
npm ci
npx prisma migrate deploy
npm run dev
```

Installation and the development command generate the Prisma client. The API defaults to port `4000`; [liveness](http://localhost:4000/health/live) checks the process, while [readiness](http://localhost:4000/health/ready) checks required database schema.

Create a login-capable development account through the normal signup flow with managed Auth configured. The existing `db:seed` script writes legacy local account records; it does not provision a managed identity by itself.

## Start the web app

In a second terminal, from `frontend/`:

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Restart or rebuild after changing `NEXT_PUBLIC_*` settings, which are bundled into the frontend.

## Build and load the Chrome extension

From `extension/`:

```sh
npm ci
npm run build:dev
```

In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `extension/dist/development`. This build targets the local web app/API.

`npm run package` creates a verified production ZIP targeting `https://api.jobhazel.com`; the unpacked production folder is `extension/dist/production`. See the [extension README](../extension/README.md) for capture behavior and the [release checklist](../extension/RELEASE.md) for rollout.

## Tests and additional checks

See [the README's test commands](../README.MD#testing) for all three packages. Frontend lint and production build checks run with `npm run lint` and `npm run build` from `frontend/`. Extension `npm test` includes type checking and both builds.

Browser tests require a migrated, isolated PostgreSQL database and explicitly configured `E2E_DATABASE_URL` and `E2E_DATABASE_HOST`. They start the API on port `4100` and frontend on port `3100`, simulate remote auth/storage, and exercise real API routes and database queries. See [browser test setup](../frontend/e2e/README.md).

The [CI workflow](../.github/workflows/ci.yml) also runs `test:applications:atomic` and `test:notifications:redesign` from `backend/` against disposable PostgreSQL. These SQL regression scripts require explicit isolated database configuration; see [notification verification](../backend/NOTIFICATIONS.md#verification) and each script's configuration checks.

## Builds and deployment

- **Web app:** `npm run build` from `frontend/` generates the static site in `frontend/out`. Set `NEXT_PUBLIC_API_BASE_URL` before building and host the export on a static host.
- **API:** run `npm start` from `backend/` or use the included Vercel entry point. Apply migrations and use the production configuration documented in [release verification](../backend/RELEASE.md).
- **Extension:** `npm run package` from `extension/` builds and validates the production ZIP. Store publication and final extension-ID configuration are documented separately.

Production validates managed Auth, HTTPS origins, secure cookies, complete R2 configuration, and maintenance secrets. On Vercel, configure `CRON_SECRET`; leave `RESUME_CLEANUP_SECRET` empty or set it to the same value so the scheduled bearer token is accepted.

The default [Vercel configuration](../backend/vercel.json) schedules resume cleanup at **04:17 UTC**, auth cleanup at **04:27 UTC**, and notification maintenance at **15:07 UTC** daily. Expanded reminder delivery needs a more frequent worker and independent monitoring; see [notification operations](../backend/NOTIFICATIONS.md). Other hosts need equivalent authenticated scheduled requests.

Use `npm run verify:release` from `backend/` with the intended deployment environment for read-only release checks. Automated browser tests use simulated providers; live authentication, storage access, email delivery, and cancellation have separate acceptance checks in the release notes.
