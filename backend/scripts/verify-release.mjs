// Read-only release verification. Never imports users, migrates, sends mail,
// uploads resumes, or invokes the mutating cron endpoints.
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { migrationChecksumMatches } from "./lib/migration-checksum.mjs";
import { Pool } from "pg";
import { S3Client, HeadBucketCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";
import { productionConfigurationIssues } from "../src/config/release-policy.js";

const results = [];
async function check(name, fn) {
  try { const detail = await fn(); results.push({ name, ok: true, ...(detail ? { detail } : {}) }); }
  catch { results.push({ name, ok: false }); } // Provider errors may contain credentials or personal data.
}
const assert = (condition) => { if (!condition) throw new Error("Check failed"); };
let config;
try {
  const { loadEnv } = await import("../src/config/env.js");
  config = loadEnv({ ...process.env, NODE_ENV: "production" });
}
catch (error) {
  // loadEnv errors contain setting names only, except URL parsing errors.
  console.log(JSON.stringify({ ok: false, configuration: error.code === "ERR_INVALID_URL" ? "Invalid URL setting." : error.message }, null, 2));
  process.exit(1);
}
const issues = productionConfigurationIssues(config, { requireScheduled: true });
results.push({ name: "production configuration", ok: !issues.length, issues });
const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? config.DATABASE_URL, connectionTimeoutMillis: 10000, statement_timeout: 10000, max: 1 });
try {
  await check("all migration checksums applied", async () => {
    const root = new URL("../prisma/migrations/", import.meta.url);
    const expected = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory());
    const { rows } = await pool.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"');
    assert(!rows.some((row) => !row.finished_at && !row.rolled_back_at));
    for (const entry of expected) {
      const source = await readFile(new URL(`${entry.name}/migration.sql`, root));
      assert(rows.some((row) => row.migration_name === entry.name && row.finished_at && !row.rolled_back_at && migrationChecksumMatches(source, row.checksum)));
    }
    return { migrations: expected.length };
  });
  await check("managed identities linked", async () => {
    const { rows } = await pool.query('SELECT count(*)::int AS missing FROM "User" u LEFT JOIN neon_auth.user n ON n.id::text = u."neonAuthId"::text WHERE n.id IS NULL');
    assert(rows[0].missing === 0);
  });
} finally { await pool.end(); }

const s3 = new S3Client({ region: "auto", endpoint: config.R2_ENDPOINT, credentials: { accessKeyId: config.R2_ACCESS_KEY_ID, secretAccessKey: config.R2_SECRET_ACCESS_KEY }, maxAttempts: 1 });
try {
  await check("R2 bucket accessible", () => s3.send(new HeadBucketCommand({ Bucket: config.R2_BUCKET_NAME }), { abortSignal: AbortSignal.timeout(10000) }).then(() => undefined));
  await check("R2 browser CORS", async () => {
    const { CORSRules = [] } = await s3.send(new GetBucketCorsCommand({ Bucket: config.R2_BUCKET_NAME }), { abortSignal: AbortSignal.timeout(10000) });
    const origins = config.CORS_ORIGIN.split(",").map((origin) => origin.trim());
    for (const origin of origins) assert(CORSRules.some((rule) => rule.AllowedOrigins?.includes(origin) && rule.AllowedMethods?.includes("PUT") && rule.AllowedHeaders?.some((header) => ["*", "content-type"].includes(header.toLowerCase()))));
  });
} finally { s3.destroy(); }

for (const [name, path, expected, authenticated] of [
  ["API schema readiness", "/health/ready", 200],
  ["anonymous account access denied", "/auth/me", 401],
  ["notification status protected", "/notifications/maintenance/status", 401],
  ["notification scheduler and capacity", "/notifications/maintenance/status", 200, true],
  ["resume cleanup status", "/resumes/maintenance/status", 200, true],
]) await check(name, async () => {
  const response = await fetch(`${config.API_PUBLIC_URL}${path}`, { redirect: "error", signal: AbortSignal.timeout(15000), headers: authenticated ? { Authorization: `Bearer ${config.CRON_SECRET}` } : {} });
  assert(response.status === expected);
  if (path === "/health/ready") assert((await response.json()).ok === true);
  if (authenticated && path.includes("notifications")) assert((await response.json()).status?.ok === true);
  if (authenticated && path.includes("resumes")) {
    const body = await response.json();
    const latest = body.status?.latestCleanupRun;
    assert(latest?.status === "COMPLETED" && latest.failedCount === 0 && Date.now() - +new Date(latest.completedAt) < 26 * 3600000);
  }
});
await check("frontend available", async () => {
  const response = await fetch(config.APP_URL, { signal: AbortSignal.timeout(15000) });
  assert(response.ok && response.headers.get("content-type")?.includes("text/html"));
});
const ok = results.every((result) => result.ok);
console.log(JSON.stringify({ ok, results, manualChecks: ["Confirm R2 public bucket access and public custom domains are disabled in Cloudflare.", "Run browser auth/recovery and resume upload/download on the deployed app with an authorized test account.", "Confirm signed Resend callbacks and scheduled email delivery with an authorized recipient."] }, null, 2));
process.exitCode = ok ? 0 : 1;
