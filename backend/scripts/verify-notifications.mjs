// Run only against a disposable database branch. No real email is sent.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

dotenv.config({ path: ".env.notification-test", quiet: true });
const connectionString = process.env.TEST_NOTIFICATION_DATABASE_URL;
const expectedHost = process.env.TEST_NOTIFICATION_DATABASE_HOST;
if (!connectionString || !expectedHost || new URL(connectionString).hostname !== expectedHost || expectedHost.includes("-pooler")) {
  throw new Error("Set TEST_NOTIFICATION_DATABASE_URL and TEST_NOTIFICATION_DATABASE_HOST to the direct endpoint of a disposable test branch.");
}
process.env.DATABASE_URL = connectionString;
process.env.DATABASE_URL_UNPOOLED = connectionString;
const migration = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: process.env, stdio: "inherit" });
assert.equal(migration.status, 0, "Test branch migrations must apply cleanly");

const { enqueueNotifications, deliverNotification, runNotificationDelivery, updateNotificationPreferences, unsubscribeNotifications } = await import("../src/services/notifications.services.js");
const { unsubscribeToken } = await import("../src/services/notification-policy.js");
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const suffix = crypto.randomUUID();
const config = { RESEND_API_KEY: "test-only", EMAIL_FROM: "JobHazel <reminders@example.invalid>", APP_URL: "https://app.example.invalid", API_PUBLIC_URL: "https://api.example.invalid", NOTIFICATION_UNSUBSCRIBE_SECRET: crypto.randomBytes(32).toString("hex") };
const now = new Date();
const sent = [];
let user;
const send = async (payload, key) => {
  assert.equal(payload.to[0], user.email, "Test sends must belong to the synthetic test account");
  sent.push({ payload, key });
  return `test-provider-${sent.length}`;
};
try {
  assert.equal(await prisma.notificationPreference.count({ where: { emailEnabled: true } }), 0, "Use a fresh branch without opted-in accounts");
  user = await prisma.user.create({ data: { email: `notification-test-${suffix}@example.invalid`, passwordHash: "not-a-login-hash", emailVerifiedAt: now } });
  await updateNotificationPreferences(user.id, { emailEnabled: true, timeZone: "UTC" }, { prisma });
  const task = await prisma.task.create({ data: { userId: user.id, title: "Integration upcoming task", dueDate: now } });
  await prisma.task.create({ data: { userId: user.id, title: "Integration overdue task", dueDate: new Date(+now - 2 * 86400000) } });
  const application = await prisma.application.create({ data: { userId: user.id, title: "Integration interview" } });
  const interview = await prisma.interview.create({ data: { userId: user.id, applicationId: application.id, type: "TECHNICAL", scheduledAt: new Date(+now + 30 * 60000) } });
  const queued = await Promise.all([enqueueNotifications(prisma, now), enqueueNotifications(prisma, now)]);
  assert.equal(queued.reduce((sum, count) => sum + count, 0), 3);
  assert.equal(await prisma.notificationDelivery.count({ where: { userId: user.id } }), 3);
  const first = await prisma.notificationDelivery.findFirst({ where: { userId: user.id, resourceId: task.id } });
  const options = { prisma, config, clock: () => now, send };
  assert.deepEqual((await Promise.all([deliverNotification(first.id, options), deliverNotification(first.id, options)])).sort(), ["sent", "skipped"]);
  assert.equal(sent.length, 1);
  assert.equal((await prisma.notificationDelivery.findUnique({ where: { id: first.id } })).payload, null);

  // Revalidate canceled interviews in real SQL rather than relying on queued snapshots.
  await prisma.interview.update({ where: { id: interview.id }, data: { outcome: "CANCELED" } });
  const next = await runNotificationDelivery(options);
  assert.equal(next.sent, 1);
  assert.equal(next.canceled, 1);
  assert.equal(sent.length, 2);
  assert.equal((await runNotificationDelivery(options)).sent, 0);

  // A rescheduled task receives a distinct identity; retry persists identical JSON.
  await prisma.task.update({ where: { id: task.id }, data: { dueDate: new Date(+now + 60000) } });
  assert.equal(await enqueueNotifications(prisma, now), 1);
  const retry = await prisma.notificationDelivery.findFirst({ where: { userId: user.id, status: "PENDING" } });
  let original;
  assert.equal(await deliverNotification(retry.id, { ...options, send: async (payload, key) => { original = { payload, key }; throw new Error("ambiguous timeout"); } }), "retrying");
  assert.equal(await deliverNotification(retry.id, { ...options, clock: () => new Date(+now + 5 * 60000), send: async (payload, key) => {
    assert.deepEqual({ payload, key }, original); return "test-retry";
  } }), "sent");

  const token = unsubscribeToken(user, config.NOTIFICATION_UNSUBSCRIBE_SECRET);
  await unsubscribeNotifications(token, { prisma, config });
  await unsubscribeNotifications(token, { prisma, config });
  assert.equal((await prisma.notificationPreference.findUnique({ where: { userId: user.id } })).emailEnabled, false);
  assert.equal(await enqueueNotifications(prisma, now), 0);
  console.log("Notification database integration passed: migration, unique enqueue, concurrent claims, stale cancellation, retry JSON, unsubscribe.");
} finally {
  if (user) await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
  await pool.end();
}
