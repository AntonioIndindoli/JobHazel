import assert from "node:assert/strict";
import test from "node:test";

import { loadEnv } from "../config/env.js";

const BASE_ENV = {
  DATABASE_URL: "postgresql://example.invalid/jobhazel",
  JWT_ACCESS_SECRET: "access-secret",
  JWT_REFRESH_SECRET: "refresh-secret",
};

const COMPLETE_R2_ENV = {
  R2_ACCOUNT_ID: "example-account",
  R2_ACCESS_KEY_ID: "access-key",
  R2_SECRET_ACCESS_KEY: "secret-key",
  R2_BUCKET_NAME: "jobhazel-resumes",
  R2_ENDPOINT: "https://example-account.r2.cloudflarestorage.com",
};

test("production startup reports every missing R2 setting", () => {
  assert.throws(
    () => loadEnv({ ...BASE_ENV, NODE_ENV: "production" }),
    (error) => {
      assert.match(error.message, /Missing required resume storage env vars/);
      for (const name of [
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET_NAME",
        "R2_ENDPOINT",
      ]) {
        assert.match(error.message, new RegExp(name));
      }
      return true;
    },
  );
});

test("partial R2 configuration fails in development", () => {
  assert.throws(
    () => loadEnv({ ...BASE_ENV, R2_BUCKET_NAME: "jobhazel-resumes" }),
    /Missing required resume storage env vars/,
  );
});

test("resume limits are parsed and validated", () => {
  const config = loadEnv({
    ...BASE_ENV,
    RESUME_UPLOAD_MAX_BYTES: "1024",
    RESUME_ACTIVE_LIMIT: "3",
    RESUME_SIGNED_URL_TTL_SECONDS: "60",
  });
  assert.equal(config.RESUME_UPLOAD_MAX_BYTES, 1024);
  assert.equal(config.RESUME_ACTIVE_LIMIT, 3);
  assert.equal(config.RESUME_SIGNED_URL_TTL_SECONDS, 60);
  assert.throws(
    () => loadEnv({ ...BASE_ENV, RESUME_SIGNED_URL_TTL_SECONDS: "604801" }),
    /RESUME_SIGNED_URL_TTL_SECONDS/,
  );
});

test("production requires authenticated cleanup and parses lifecycle controls", () => {
  assert.throws(
    () => loadEnv({ ...BASE_ENV, ...COMPLETE_R2_ENV, NODE_ENV: "production" }),
    /RESUME_CLEANUP_SECRET or CRON_SECRET/,
  );

  const config = loadEnv({
    ...BASE_ENV,
    ...COMPLETE_R2_ENV,
    NODE_ENV: "production",
    CRON_SECRET: "maintenance-secret",
    RESUME_CLEANUP_STALE_HOURS: "48",
    RESUME_CLEANUP_BATCH_SIZE: "50",
    RESUME_RATE_LIMIT_WINDOW_SECONDS: "300",
    RESUME_UPLOAD_INIT_RATE_LIMIT: "5",
    RESUME_UPLOAD_COMPLETE_RATE_LIMIT: "8",
    RESUME_DOWNLOAD_RATE_LIMIT: "30",
  });
  assert.equal(config.RESUME_CLEANUP_SECRET, "maintenance-secret");
  assert.equal(config.RESUME_CLEANUP_STALE_HOURS, 48);
  assert.equal(config.RESUME_CLEANUP_BATCH_SIZE, 50);
  assert.equal(config.RESUME_RATE_LIMIT_WINDOW_SECONDS, 300);
  assert.equal(config.RESUME_UPLOAD_INIT_RATE_LIMIT, 5);
  assert.equal(config.RESUME_UPLOAD_COMPLETE_RATE_LIMIT, 8);
  assert.equal(config.RESUME_DOWNLOAD_RATE_LIMIT, 30);
});
