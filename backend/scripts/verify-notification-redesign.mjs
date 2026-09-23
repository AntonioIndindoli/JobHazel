// Disposable branch only. All provider calls are fakes; no emails are sent.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.TEST_NOTIFICATION_DATABASE_URL;
const expectedHost = process.env.TEST_NOTIFICATION_DATABASE_HOST;
if (!connectionString || !expectedHost || new URL(connectionString).hostname !== expectedHost || expectedHost.includes("-pooler")) throw Error("Set the direct disposable TEST_NOTIFICATION_DATABASE_URL and matching TEST_NOTIFICATION_DATABASE_HOST.");
for (const file of [".env", ".env.local"]) {
  if (!fs.existsSync(file)) continue;
  const values = dotenv.parse(fs.readFileSync(file));
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) if (values[key] && new URL(values[key]).hostname.replace("-pooler", "") === expectedHost) throw Error("Refusing an application database. Create a separate disposable branch.");
}
process.env.DATABASE_URL = connectionString;
process.env.NOTIFICATION_MODE = "daily-digest-scheduled-interviews";
// No real provider secret is used by these checks.
const config = { NOTIFICATION_MODE: "daily-digest-scheduled-interviews", NOTIFICATION_COHORT_LIMIT: 1000, NOTIFICATION_RUN_BUDGET_MS: 45000, RESEND_API_KEY: "fake", EMAIL_FROM: "test@example.com", APP_URL: "https://example.com", API_PUBLIC_URL: "https://api.example.com", NOTIFICATION_UNSUBSCRIBE_SECRET: "integration-secret" };
const { reconcileUser, enqueueDigest, processOperation, cancelNotificationOperations, runDailyNotifications } = await import("../src/services/notification-operations.services.js");
const { setPrismaForTests } = await import("../src/db/prisma.js");
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
setPrismaForTests(prisma);
const users = [];
const providerIds = new Set();
const now = new Date();
const deliveries = new Map();
let sends = 0, cancels = 0;
const provider = {
  async schedule(payload, key) {
    if (deliveries.has(key)) return { id: deliveries.get(key).id };
    const id = crypto.randomUUID(); sends++; providerIds.add(id);
    deliveries.set(key, { id, payload, last_event: payload.scheduled_at ? "scheduled" : "sent" }); return { id };
  },
  async cancel(id) { cancels++; for (const row of deliveries.values()) if (row.id === id) row.last_event = "canceled"; return { id }; },
  async retrieve(id) { return [...deliveries.values()].find((item) => item.id === id) ?? { id, last_event: "scheduled" }; },
};
const options = { prisma, config, provider, clock: () => new Date() };
try {
  const user = await prisma.user.create({ data: { email: `notification-${crypto.randomUUID()}@example.com`, emailVerifiedAt: now,
    notificationPreference: { create: { emailEnabled: true, timeZone: "UTC" } } } }); users.push(user.id);
  const application = await prisma.application.create({ data: { userId: user.id, title: "Test application" } });
  const interview = await prisma.interview.create({ data: { userId: user.id, applicationId: application.id, type: "TECHNICAL", scheduledAt: new Date(+now + 3 * 86400000) } });
  await Promise.all([reconcileUser(prisma, user.id, { config, now }), reconcileUser(prisma, user.id, { config, now })]);
  assert.equal(await prisma.notificationOperation.count({ where: { userId: user.id, desired: true } }), 1);
  let operation = await prisma.notificationOperation.findFirst({ where: { userId: user.id, desired: true } });
  assert.deepEqual((await Promise.all([processOperation(operation.id, options), processOperation(operation.id, options)])).sort(), ["scheduled", "skipped"]);
  assert.equal(sends, 1);
  await reconcileUser(prisma, user.id, { config, now });
  assert.equal(await prisma.notificationOperation.count({ where: { userId: user.id } }), 1, "No-op reconciliation preserves revision");

  await prisma.interview.update({ where: { id: interview.id }, data: { scheduledAt: new Date(+now + 4 * 86400000) } });
  await reconcileUser(prisma, user.id, { config, now });
  let replacement = await prisma.notificationOperation.findFirst({ where: { userId: user.id, desired: true } });
  assert.equal(await processOperation(replacement.id, options), "pending", "Replacement waits for old cancellation");
  assert.equal(await processOperation(operation.id, options), "canceled");
  await prisma.notificationOperation.update({ where: { id: replacement.id }, data: { nextAttemptAt: now } });
  assert.equal(await processOperation(replacement.id, options), "scheduled");
  assert.equal(cancels, 1);

  await prisma.task.create({ data: { userId: user.id, title: "Due today", dueDate: now } });
  await Promise.all([enqueueDigest(prisma, user.id, now, config), enqueueDigest(prisma, user.id, now, config)]);
  assert.equal(await prisma.notificationOperation.count({ where: { userId: user.id, kind: "TASK_DIGEST" } }), 1);
  const digest = await prisma.notificationOperation.findFirst({ where: { userId: user.id, kind: "TASK_DIGEST" } });
  assert.equal(await processOperation(digest.id, options), "scheduled");
  const draft = await prisma.notificationOperation.create({ data: { userId: user.id, kind: "TASK_DIGEST", familyKey: crypto.randomUUID(), revision: "expired", eventAt: now, sendAt: now, expiresAt: new Date(+now - 1), payload: { to: [user.email] }, nextAttemptAt: now } });
  assert.equal(await processOperation(draft.id, options), "canceled");

  // A response can arrive AFTER account deletion. The row must survive and retain
  // the new receipt, but no recipient body may be restored by acknowledgement.
  const other = await prisma.user.create({ data: { email: `notification-delete-${crypto.randomUUID()}@example.com`, emailVerifiedAt: now, notificationPreference: { create: { emailEnabled: true } } } }); users.push(other.id);
  const app2 = await prisma.application.create({ data: { userId: other.id, title: "Delete test" } });
  await prisma.interview.create({ data: { userId: other.id, applicationId: app2.id, type: "TECHNICAL", scheduledAt: new Date(+now + 2 * 86400000) } });
  await reconcileUser(prisma, other.id, { config, now });
  const deleting = await prisma.notificationOperation.findFirst({ where: { userId: other.id } });
  await processOperation(deleting.id, { ...options, provider: { ...provider, schedule: async (payload, key) => {
    await prisma.$transaction(async (tx) => { await cancelNotificationOperations(tx, other.id, {}, { erase: true, config }); await tx.user.delete({ where: { id: other.id } }); });
    return provider.schedule(payload, key);
  } } });
  let tombstone = await prisma.notificationOperation.findUnique({ where: { id: deleting.id } });
  assert.equal(tombstone.userId, null); assert.equal(tombstone.payload, null); assert.ok(tombstone.providerId);
  await processOperation(deleting.id, options);
  tombstone = await prisma.notificationOperation.findUnique({ where: { id: deleting.id } });
  assert.equal(tombstone.status, "CANCELED");

  // UNKNOWN creation remains blocked after 24h, including a new daily run.
  const unknown = await prisma.notificationOperation.create({ data: { userId: user.id, kind: "TASK_DIGEST", familyKey: crypto.randomUUID(), revision: "unknown", eventAt: now, sendAt: now, expiresAt: new Date(+now + 86400000), firstAttemptAt: new Date(+now - 24 * 3600000), payload: { to: [user.email] }, nextAttemptAt: now } });
  assert.equal(await processOperation(unknown.id, options), "unknown");
  assert.equal((await prisma.notificationOperation.findUnique({ where: { id: unknown.id } })).payload, null);
  await prisma.notificationOperation.update({ where: { id: unknown.id }, data: { status: "CANCELED", desired: false } });

  // Exercise the common domain service, not just direct ledger calls.
  const { createInterview, updateInterview, deleteInterview } = await import("../src/services/interviews.services.js");
  const created = await createInterview(user.id, { applicationId: application.id, type: "TECHNICAL", scheduledAt: new Date(+now + 5 * 86400000), outcome: "SCHEDULED" }, { config, provider });
  assert.equal(created.notification.needsAttention, false);
  let sourceOp = await prisma.notificationOperation.findFirst({ where: { userId: user.id, resourceId: created.interview.id, desired: true } });
  assert.equal(sourceOp.status, "SCHEDULED");
  await updateInterview(user.id, created.interview.id, { scheduledAt: new Date(+now + 6 * 86400000) }, { config, provider });
  assert.equal((await prisma.notificationOperation.findUnique({ where: { id: sourceOp.id } })).status, "CANCELED");
  await deleteInterview(user.id, created.interview.id, { config, provider });
  assert.equal(await prisma.notificationOperation.count({ where: { userId: user.id, resourceId: created.interview.id, desired: true } }), 0);

  // Scope daily discovery to the synthetic user, while using real SQL for all
  // state transitions. This never touches copied users' preferences or tasks.
  const scoped = {
    notificationDelivery: prisma.notificationDelivery, notificationOperation: prisma.notificationOperation,
    notificationSync: prisma.notificationSync, notificationRun: prisma.notificationRun, notificationProviderEvent: prisma.notificationProviderEvent,
    interview: prisma.interview, task: prisma.task, $transaction: (fn, options) => prisma.$transaction(fn, options),
    user: {
    findMany: (args) => prisma.user.findMany({ ...args, where: { ...args.where, id: user.id } }),
    findUnique: (...args) => prisma.user.findUnique(...args),
    count: (args) => prisma.user.count({ ...args, where: { ...args.where, id: user.id } }),
    },
  };
  // Daily maintenance does inspect global notification ledgers on this disposable branch.
  const result = await runDailyNotifications({ ...options, prisma: scoped });
  assert.equal(result.unknown, 0);
  const countBefore = sends;
  await runDailyNotifications({ ...options, prisma: scoped });
  assert.equal(sends, countBefore, "Repeated daily job does not resend");
  const benchmarkUsers = Number(process.env.NOTIFICATION_BENCHMARK_USERS ?? 0);
  if (benchmarkUsers > 0 && benchmarkUsers <= 100) {
    const prefix = crypto.randomUUID();
    const ids = Array.from({ length: benchmarkUsers }, (_, i) => "bench-" + prefix + "-" + i);
    users.push(...ids);
    await prisma.user.createMany({ data: ids.map((id) => ({ id, email: id + "@example.com", emailVerifiedAt: now })) });
    await prisma.notificationPreference.createMany({ data: ids.map((userId) => ({ userId, emailEnabled: true, timeZone: "UTC" })) });
    await prisma.application.createMany({ data: ids.map((userId) => ({ id: userId + "-app", userId, title: "Benchmark role" })) });
    await prisma.interview.createMany({ data: ids.map((userId) => ({ userId, applicationId: userId + "-app", type: "TECHNICAL", scheduledAt: new Date(+now + 3 * 86400000) })) });
    await prisma.task.createMany({ data: ids.map((userId) => ({ userId, title: "Benchmark task", dueDate: now })) });
    const benchPrisma = { ...scoped, user: { ...scoped.user,
      findMany: (args) => prisma.user.findMany({ ...args, where: { ...args.where, id: { in: ids } } }),
      count: (args) => prisma.user.count({ ...args, where: { ...args.where, id: { in: ids } } }),
    } };
    await prisma.notificationRun.deleteMany({ where: { id: result.runDate } });
    const started = Date.now();
    const benchmark = await runDailyNotifications({ ...options, prisma: benchPrisma, config: { ...config, NOTIFICATION_COHORT_LIMIT: benchmarkUsers } });
    console.log(JSON.stringify({ benchmarkUsers, elapsedMs: Date.now() - started, ...benchmark }));
    assert.equal(benchmark.incomplete, false, "Rollout cohort must drain inside one invocation");
  }
  console.log("PASS: SQL migration, concurrent revision discovery/claims, reschedule ordering, digest uniqueness/expiry, deletion during acceptance, 24h retry stop, repeated daily run.");
  console.log(JSON.stringify({ syntheticSends: sends, syntheticCancellations: cancels, dailyRun: result }));
} finally {
  await prisma.notificationOperation.deleteMany({ where: { OR: [{ userId: { in: users } }, { providerId: { in: [...providerIds] } }] } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect(); await pool.end();
}
