// src/config/env.js
import dotenv from "dotenv";
dotenv.config();

const R2_ENV_NAMES = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_ENDPOINT",
];

function required(source, name) {
  const value = source[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

function optional(source, name, fallback) {
  const value = source[name];
  return value && value.trim() !== "" ? value.trim() : fallback;
}

function integer(source, name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = optional(source, name, String(fallback));
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Invalid env var ${name}: expected an integer between ${min} and ${max}.`);
  }
  return value;
}

function loadResumeStorageEnv(source, nodeEnv) {
  const values = Object.fromEntries(R2_ENV_NAMES.map((name) => [name, optional(source, name, null)]));
  const shouldConfigure = nodeEnv === "production" || R2_ENV_NAMES.some((name) => values[name] !== null);

  if (shouldConfigure) {
    const missing = R2_ENV_NAMES.filter((name) => values[name] === null);
    if (missing.length > 0) {
      throw new Error(`Missing required resume storage env vars: ${missing.join(", ")}.`);
    }

    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(values.R2_BUCKET_NAME)) {
      throw new Error("Invalid env var R2_BUCKET_NAME: expected a 3-63 character lowercase bucket name.");
    }

    let endpoint;
    try {
      endpoint = new URL(values.R2_ENDPOINT);
    } catch {
      throw new Error("Invalid env var R2_ENDPOINT: expected a valid HTTPS URL.");
    }
    if (endpoint.protocol !== "https:") {
      throw new Error("Invalid env var R2_ENDPOINT: expected a valid HTTPS URL.");
    }
    values.R2_ENDPOINT = endpoint.toString().replace(/\/$/, "");
  }

  return { ...values, RESUME_STORAGE_ENABLED: shouldConfigure };
}

function loadResumeMaintenanceEnv(source, nodeEnv) {
  const cleanupSecret = optional(
    source,
    "RESUME_CLEANUP_SECRET",
    optional(source, "CRON_SECRET", null),
  );
  if (nodeEnv === "production" && !cleanupSecret) {
    throw new Error("Missing required env var: RESUME_CLEANUP_SECRET or CRON_SECRET");
  }

  return {
    RESUME_CLEANUP_SECRET: cleanupSecret,
    RESUME_CLEANUP_STALE_HOURS: integer(source, "RESUME_CLEANUP_STALE_HOURS", 24, {
      max: 24 * 30,
    }),
    RESUME_CLEANUP_BATCH_SIZE: integer(source, "RESUME_CLEANUP_BATCH_SIZE", 100, {
      max: 500,
    }),
    RESUME_RATE_LIMIT_WINDOW_SECONDS: integer(source, "RESUME_RATE_LIMIT_WINDOW_SECONDS", 900, {
      max: 86400,
    }),
    RESUME_UPLOAD_INIT_RATE_LIMIT: integer(source, "RESUME_UPLOAD_INIT_RATE_LIMIT", 10, {
      max: 1000,
    }),
    RESUME_UPLOAD_COMPLETE_RATE_LIMIT: integer(source, "RESUME_UPLOAD_COMPLETE_RATE_LIMIT", 20, {
      max: 1000,
    }),
    RESUME_DOWNLOAD_RATE_LIMIT: integer(source, "RESUME_DOWNLOAD_RATE_LIMIT", 60, {
      max: 5000,
    }),
  };
}

export function loadEnv(source = process.env) {
  const nodeEnv = optional(source, "NODE_ENV", "development");
  const notificationMode = optional(source, "NOTIFICATION_MODE", "legacy");
  if (!["legacy", "daily-digest-scheduled-interviews", "drain"].includes(notificationMode)) throw new Error("Invalid NOTIFICATION_MODE.");
  const resumeStorage = loadResumeStorageEnv(source, nodeEnv);
  const resumeMaintenance = loadResumeMaintenanceEnv(source, nodeEnv);
  const authBaseUrl = optional(source, "NEON_AUTH_BASE_URL", null)?.replace(/\/$/, "");
  if (authBaseUrl && new URL(authBaseUrl).protocol !== "https:") throw new Error("NEON_AUTH_BASE_URL must use HTTPS.");
  const cookieSameSite = optional(source, "COOKIE_SAME_SITE", "lax");
  if (!["lax", "strict", "none"].includes(cookieSameSite)) throw new Error("COOKIE_SAME_SITE must be lax, strict, or none.");
  const cookieSecure = optional(source, "COOKIE_SECURE", nodeEnv === "production" ? "true" : "false") === "true";
  if (cookieSameSite === "none" && !cookieSecure) throw new Error("COOKIE_SAME_SITE=none requires COOKIE_SECURE=true.");

  return {
    NODE_ENV: nodeEnv,
    PORT: integer(source, "PORT", 4000, { max: 65535 }),
    DATABASE_URL: required(source, "DATABASE_URL"),
    NEON_AUTH_BASE_URL: authBaseUrl,
    AUTH_RATE_LIMIT_SECRET: optional(source, "AUTH_RATE_LIMIT_SECRET", optional(source, "JWT_ACCESS_SECRET", null)),
    CORS_ORIGIN: optional(source, "CORS_ORIGIN", "http://localhost:3000"),
    EXTENSION_ORIGINS: optional(
      source,
      "EXTENSION_ORIGINS",
      "chrome-extension://nlbcijcaamjlllibnbkgmbeniaiagdkl",
    ),
    COOKIE_SECURE: cookieSecure,
    COOKIE_SAME_SITE: cookieSameSite,
    APP_URL: optional(source, "APP_URL", "http://localhost:3000").replace(/\/$/, ""),
    RESEND_API_KEY: optional(source, "RESEND_API_KEY", null),
    EMAIL_FROM: optional(source, "EMAIL_FROM", "JobHazel <onboarding@resend.dev>"),
    CRON_SECRET: optional(source, "CRON_SECRET", null),
    API_PUBLIC_URL: optional(source, "API_PUBLIC_URL", nodeEnv === "production" ? null : "http://localhost:4000")?.replace(/\/$/, ""),
    NOTIFICATION_UNSUBSCRIBE_SECRET: optional(source, "NOTIFICATION_UNSUBSCRIBE_SECRET", null),
    NOTIFICATION_MODE: notificationMode,
    RESEND_WEBHOOK_SECRET: optional(source, "RESEND_WEBHOOK_SECRET", null),
    NOTIFICATION_RUN_BUDGET_MS: integer(source, "NOTIFICATION_RUN_BUDGET_MS", 45000, { min: 1000, max: 240000 }),
    NOTIFICATION_COHORT_LIMIT: integer(source, "NOTIFICATION_COHORT_LIMIT", 5, { max: 1000 }),
    NOTIFICATION_PROVIDER_INTERVAL_MS: integer(source, "NOTIFICATION_PROVIDER_INTERVAL_MS", 200, { min: 100, max: 5000 }),
    RESUME_UPLOAD_MAX_BYTES: integer(source, "RESUME_UPLOAD_MAX_BYTES", 5 * 1024 * 1024),
    RESUME_ACTIVE_LIMIT: integer(source, "RESUME_ACTIVE_LIMIT", 10),
    RESUME_SIGNED_URL_TTL_SECONDS: integer(source, "RESUME_SIGNED_URL_TTL_SECONDS", 300, {
      max: 604800,
    }),
    ...resumeMaintenance,
    ...resumeStorage,
  };
}

export const env = loadEnv();
