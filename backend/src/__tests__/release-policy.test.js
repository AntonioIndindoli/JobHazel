import test from "node:test";
import assert from "node:assert/strict";
import { productionConfigurationIssues } from "../config/release-policy.js";
import { notificationHealth } from "../services/notification-health.services.js";
import { healthService } from "../services/health.services.js";
import { setPrismaForTests } from "../db/prisma.js";

const config = {
  NEON_AUTH_BASE_URL: "https://auth.example.com/auth", AUTH_RATE_LIMIT_SECRET: "a".repeat(32), COOKIE_SECURE: true,
  APP_URL: "https://example.com", API_PUBLIC_URL: "https://api.example.com", CORS_ORIGIN: "https://example.com",
  CRON_SECRET: "c".repeat(32), RESUME_CLEANUP_SECRET: "c".repeat(32),
  NOTIFICATION_MODE: "daily-digest-scheduled-interviews", RESEND_API_KEY: "test", RESEND_WEBHOOK_SECRET: "whsec_test",
  NOTIFICATION_UNSUBSCRIBE_SECRET: "u".repeat(32), EMAIL_FROM: "mail@example.com", NOTIFICATION_RUN_BUDGET_MS: 45000, NOTIFICATION_COHORT_LIMIT: 5,
};
test("release configuration rejects silent legacy fallback and unsafe cron configuration", () => {
  assert.deepEqual(productionConfigurationIssues(config, { requireScheduled: true }), []);
  for (const change of [{ NOTIFICATION_MODE: null }, { RESUME_CLEANUP_SECRET: "other" }, { COOKIE_SECURE: false }, { RESEND_WEBHOOK_SECRET: null }, { NOTIFICATION_RUN_BUDGET_MS: 60000 }, { CORS_ORIGIN: "*" }, { APP_URL: "http://localhost" }]) {
    assert.ok(productionConfigurationIssues({ ...config, ...change }).length, JSON.stringify(change));
  }
  assert.ok(productionConfigurationIssues({ ...config, NOTIFICATION_MODE: "legacy" }, { requireScheduled: true }).length);
  assert.ok(productionConfigurationIssues({ ...config, NOTIFICATION_COHORT_LIMIT: 1000 }).length);
  assert.deepEqual(productionConfigurationIssues({ ...config, NOTIFICATION_COHORT_LIMIT: 0, NOTIFICATION_WORKER_INTERVAL_SECONDS: 300 }), []);
});
test("readiness fails closed for missing schema and never exposes database errors", async () => {
  setPrismaForTests({ $queryRaw: async () => { throw new Error("password=secret database host"); } });
  try {
    const health = await healthService.readiness();
    assert.equal(health.ok, false);
    assert.ok(!JSON.stringify(health).includes("secret"));
  } finally { setPrismaForTests(null); }
});
test("operator status detects missed schedules, capacity exclusions and unresolved work without writes", async () => {
  const prisma = {
    notificationRun: { findFirst: async () => ({ id: "2026-09-28", completedAt: new Date("2026-09-28T15:08Z") }) },
    notificationOperation: { count: async () => 0, findFirst: async () => null },
    notificationSync: { count: async () => 0, findFirst: async () => null }, user: { count: async () => 5 },
    notificationProviderEvent: { findFirst: async () => null },
    notificationWorkerState: { findUnique: async () => ({ lastFinishedAt: new Date("2026-09-28T15:08Z") }) },
    providerRateLimit: { findUnique: async () => null },
  };
  assert.equal((await notificationHealth({ prisma, config, now: new Date("2026-09-29T15:30Z") })).ok, true);
  assert.equal((await notificationHealth({ prisma, config, now: new Date("2026-09-29T16:08Z") })).scheduler.stale, true);
  prisma.user.count = async () => 6;
  const status = await notificationHealth({ prisma, config, now: new Date("2026-09-29T08:00Z") });
  assert.equal(status.ok, false); assert.equal(status.capacity.excludedUsers, 1);
  prisma.notificationOperation.count = async () => 1;
  assert.equal((await notificationHealth({ prisma, config })).unknown, 1);
  prisma.notificationWorkerState.findUnique = async () => ({ lastFinishedAt: new Date("2026-09-29T08:00Z") });
  prisma.notificationSync.findFirst = async () => ({ updatedAt: new Date("2026-09-29T08:00Z") });
  prisma.providerRateLimit.findUnique = async () => ({ blockedUntil: new Date("2026-09-29T10:00Z") });
  const alerted = await notificationHealth({ prisma, config: { ...config, NOTIFICATION_WORKER_INTERVAL_SECONDS: 300 }, now: new Date("2026-09-29T09:00Z") });
  for (const code of ["WORKER_MISSED", "UNKNOWN_ACCEPTANCE", "DELIVERY_FAILED", "CAPACITY_EXCLUDED", "BACKLOG_AGED", "PROVIDER_COOLDOWN"]) {
    assert.ok(alerted.alerts.some(a => a.code === code && a.action), code);
  }
  assert.equal((await notificationHealth({ prisma, config: { ...config, NOTIFICATION_COHORT_LIMIT: 0 } })).capacity.excludedUsers, 0);
});
