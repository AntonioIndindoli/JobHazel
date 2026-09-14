import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { setPrismaForTests } from "../db/prisma.js";
import { errorHandler } from "../middleware/error.middleware.js";
import { accessToken, mockManagedAuth } from "./helpers/managed-auth.js";
import notificationRoutes from "../routes/notifications.routes.js";
import { DEFAULT_NOTIFICATION_PREFERENCES as defaults, eligibleKind, isQuietTime, nextAllowedTime, notificationKey, unsubscribeToken, validateNotificationPreferences, verifyUnsubscribeToken } from "../services/notification-policy.js";
import { buildNotificationEmail, sendNotificationEmail } from "../services/notification-email.services.js";
import { deliverNotification, enqueueNotifications, runNotificationDelivery, unsubscribeNotifications, updateNotificationPreferences } from "../services/notifications.services.js";

const now = new Date("2026-09-14T15:00:00Z");
const config = { RESEND_API_KEY: "test-key", EMAIL_FROM: "JobHazel <test@example.com>", APP_URL: "https://app.example.com", API_PUBLIC_URL: "https://api.example.com", NOTIFICATION_UNSUBSCRIBE_SECRET: "test-secret" };
const preferences = { ...defaults, emailEnabled: true };

function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((clause) => matches(row, clause));
    const actual = row[key];
    if (value && typeof value === "object" && !(value instanceof Date)) {
      return Object.entries(value).every(([operator, expected]) => {
        if (operator === "in") return expected.includes(actual);
        if (operator === "not") return actual !== expected;
        if (operator === "lte") return actual != null && actual <= expected;
        if (operator === "lt") return actual != null && actual < expected;
        if (operator === "gt") return actual != null && actual > expected;
        if (operator === "is") return actual && matches(actual, expected);
        throw new Error(`Unsupported fixture operator: ${operator}`);
      });
    }
    return actual instanceof Date && value instanceof Date ? +actual === +value : actual === value;
  });
}

function fixture() {
  const user = { id: "user-1", email: "person@example.com", emailVerifiedAt: now, notificationPreference: { ...preferences } };
  const state = { user: [user], task: [{ id: "task-1", userId: user.id, title: "Follow up", dueDate: now, completedAt: null }], interview: [], notificationPreference: [{ userId: user.id, ...preferences }], notificationDelivery: [] };
  let sequence = 0;
  const prisma = Object.fromEntries(Object.entries(state).map(([name, rows]) => [name, {
    async findUnique({ where }) { return structuredClone(rows.find((row) => matches(row, where)) ?? null); },
    async findFirst({ where }) { return structuredClone(rows.find((row) => matches(row, where)) ?? null); },
    async findMany({ where, take, cursor, skip = 0 }) {
      let filtered = rows.filter((row) => matches(row, where)).sort((a, b) => a.id?.localeCompare(b.id) ?? 0);
      if (cursor) filtered = filtered.slice(filtered.findIndex((row) => row.id === cursor.id) + skip);
      return structuredClone(filtered.slice(0, take));
    },
    async createMany({ data }) {
      let count = 0;
      for (const row of data) if (!rows.some((existing) => existing.dedupeKey === row.dedupeKey)) {
        rows.push({ id: `delivery-${++sequence}`, status: "PENDING", attempts: 0, firstAttemptAt: null, payload: null, leaseUntil: null, leaseToken: null, ...structuredClone(row) }); count++;
      }
      return { count };
    },
    async updateMany({ where, data }) {
      let count = 0;
      for (const row of rows.filter((entry) => matches(entry, where))) {
        for (const [key, value] of Object.entries(data)) row[key] = value === Prisma.DbNull ? null : value?.increment !== undefined ? row[key] + value.increment : structuredClone(value);
        count++;
      }
      return { count };
    },
    async upsert({ where, create, update }) {
      let row = rows.find((entry) => matches(entry, where));
      if (row) Object.assign(row, update); else { row = structuredClone(create); rows.push(row); }
      if (name === "notificationPreference") user.notificationPreference = row;
      return structuredClone(row);
    },
  }]));
  prisma.$transaction = (fn) => fn(prisma);
  prisma.$queryRaw = async (_strings, userId) => state.user.filter((row) => row.id === userId);
  return { prisma, state, user };
}

test("preference validation rejects malformed and unknown fields", () => {
  for (const value of [null, [], {}, { userId: "other" }, { emailEnabled: "true" }, { timeZone: "invalid" }, { timeZone: null }, { taskReminderDays: 8 }, { taskReminderDays: 0.5 }, { interviewReminderMinutes: 4 }, { quietHoursStart: "24:00" }]) {
    assert.throws(() => validateNotificationPreferences(value), { status: 400 });
  }
  assert.deepEqual(validateNotificationPreferences({ timeZone: "America/Los_Angeles", emailEnabled: false }), { timeZone: "America/Los_Angeles", emailEnabled: false });
});

test("quiet hours cover same-day, overnight, exact boundaries and DST", () => {
  const p = { ...preferences, timeZone: "America/Los_Angeles", quietHoursEnabled: true };
  assert.equal(isQuietTime(new Date("2026-09-15T05:00:00Z"), p), true); // 22:00
  assert.equal(isQuietTime(new Date("2026-09-15T15:00:00Z"), p), false); // 08:00
  assert.equal(nextAllowedTime(new Date("2026-03-08T09:30:00Z"), p).toISOString(), "2026-03-08T15:00:00.000Z");
  assert.equal(nextAllowedTime(new Date("2026-11-01T08:30:00Z"), p).toISOString(), "2026-11-01T16:00:00.000Z");
  assert.equal(isQuietTime(now, { ...p, timeZone: "UTC", quietHoursStart: "14:00", quietHoursEnd: "16:00" }), true);
  assert.equal(nextAllowedTime(now, preferences), now);
});

test("task due days and interview boundaries follow policy", () => {
  const task = { dueDate: new Date("2026-09-14T12:00:00Z"), completedAt: null };
  assert.equal(eligibleKind(task, preferences, new Date("2026-09-14T23:59:00Z")), "UPCOMING_TASK");
  assert.equal(eligibleKind(task, preferences, new Date("2026-09-15T00:00:00Z")), "OVERDUE_TASK");
  assert.equal(eligibleKind(task, { ...preferences, timeZone: "America/Los_Angeles" }, new Date("2026-09-15T00:00:00Z")), "UPCOMING_TASK");
  assert.equal(eligibleKind({ ...task, completedAt: now }, preferences, now), null);
  assert.equal(eligibleKind({ dueDate: null }, preferences, now), null);
  const interview = { scheduledAt: new Date(+now + 3600000), outcome: "SCHEDULED" };
  assert.equal(eligibleKind(interview, preferences, now, true), "INTERVIEW_REMINDER");
  assert.equal(eligibleKind({ ...interview, scheduledAt: now }, preferences, now, true), null);
  assert.equal(eligibleKind({ ...interview, outcome: "CANCELED" }, preferences, now, true), null);
});

test("enqueue is idempotent, paginated, opt-in and verification gated; rescheduling makes a new event", async () => {
  const { prisma, state, user } = fixture();
  for (let i = 0; i < 105; i++) state.task.push({ ...state.task[0], id: `task-extra-${i}` });
  assert.equal(await enqueueNotifications(prisma, now), 106);
  assert.equal(await enqueueNotifications(prisma, now), 0);
  state.task[0].dueDate = new Date(+now + 3600000);
  assert.equal(await enqueueNotifications(prisma, now), 1);
  assert.notEqual(notificationKey(user.id, "UPCOMING_TASK", "task-1", now), notificationKey(user.id, "OVERDUE_TASK", "task-1", now));
  user.emailVerifiedAt = null;
  state.task.push({ ...state.task[0], id: "unverified" });
  assert.equal(await enqueueNotifications(prisma, now), 0);
  user.emailVerifiedAt = now; user.notificationPreference.emailEnabled = false;
  assert.equal(await enqueueNotifications(prisma, now), 0);
});

test("overlapping workers and later cron invocations send only once", async () => {
  const { prisma, state } = fixture();
  await enqueueNotifications(prisma, now);
  let sent = 0;
  const opts = { prisma, config, clock: () => now, send: async () => { sent++; return "email-1"; } };
  const results = await Promise.all([deliverNotification(state.notificationDelivery[0].id, opts), deliverNotification(state.notificationDelivery[0].id, opts)]);
  assert.deepEqual(results.sort(), ["sent", "skipped"]);
  assert.equal(sent, 1);
  assert.equal(state.notificationDelivery[0].payload, null);
  assert.equal((await runNotificationDelivery(opts)).sent, 0);
});

test("ambiguous provider failures retry identical payload/key despite content changes", async () => {
  const { prisma, state } = fixture();
  await enqueueNotifications(prisma, now);
  let instant = now;
  const calls = [];
  const opts = { prisma, config, clock: () => instant, send: async (payload, key) => {
    calls.push({ payload: structuredClone(payload), key });
    if (calls.length === 1) throw new Error("connection reset after acceptance");
    return "email-1";
  } };
  assert.equal(await deliverNotification(state.notificationDelivery[0].id, opts), "retrying");
  state.task[0].title = "Changed title";
  instant = new Date(+now + 300000);
  assert.equal(await deliverNotification(state.notificationDelivery[0].id, opts), "sent");
  assert.deepEqual(calls[0], calls[1]);
});

test("a crash after provider acceptance recovers with the same payload; old ambiguous sends are quarantined", async () => {
  const { prisma, state } = fixture();
  await enqueueNotifications(prisma, now);
  const update = prisma.notificationDelivery.updateMany;
  let failAck = true;
  prisma.notificationDelivery.updateMany = async (args) => {
    if (args.data.status === "SENT" && failAck) throw new Error("database connection lost");
    return update(args);
  };
  const calls = [];
  let instant = now;
  const opts = { prisma, config, clock: () => instant, send: async (payload, key) => { calls.push({ payload, key }); return "accepted"; } };
  const id = state.notificationDelivery[0].id;
  await assert.rejects(deliverNotification(id, opts), /database connection lost/);
  failAck = false; instant = new Date(+now + 180000);
  assert.equal(await deliverNotification(id, opts), "sent");
  assert.deepEqual(calls[0], calls[1]);
  Object.assign(state.notificationDelivery[0], { kind: "OVERDUE_TASK", status: "PROCESSING", firstAttemptAt: now, leaseUntil: now });
  instant = new Date(+now + 24 * 3600000);
  assert.equal(await deliverNotification(id, opts), "unknown");
  assert.equal(calls.length, 2);
});

test("delivery rechecks completion, deletion, owner, opt-out, address changes and rescheduling", async () => {
  for (const mutate of [
    ({ state }) => { state.task[0].completedAt = now; },
    ({ state }) => { state.task.length = 0; },
    ({ state }) => { state.task[0].userId = "another-user"; },
    ({ user }) => { user.notificationPreference.emailEnabled = false; },
    ({ user }) => { user.emailVerifiedAt = null; },
    ({ state }) => { state.task[0].dueDate = new Date(+now + 3600000); },
    ({ state, user }) => { state.notificationDelivery[0].payload = { to: ["old@example.com"] }; user.email = "new@example.com"; },
  ]) {
    const f = fixture(); await enqueueNotifications(f.prisma, now); mutate(f);
    assert.equal(await deliverNotification(f.state.notificationDelivery[0].id, { prisma: f.prisma, config, clock: () => now, send: () => assert.fail("must not send") }), "canceled");
  }
});

test("quiet hours defer delivery, and interviews that start during quiet hours are skipped", async () => {
  const { prisma, state, user } = fixture();
  state.task.length = 0;
  state.interview.push({ id: "interview-1", userId: user.id, scheduledAt: new Date(+now + 1800000), outcome: "SCHEDULED", application: { title: "Engineer" } });
  await enqueueNotifications(prisma, now);
  user.notificationPreference = { ...preferences, quietHoursEnabled: true, quietHoursStart: "14:00", quietHoursEnd: "16:00" };
  const opts = { prisma, config, clock: () => now, send: () => assert.fail("must not send") };
  assert.equal(await deliverNotification(state.notificationDelivery[0].id, opts), "pending");
  assert.equal(state.notificationDelivery[0].nextAttemptAt.toISOString(), "2026-09-14T16:00:00.000Z");
  assert.equal(await deliverNotification(state.notificationDelivery[0].id, { ...opts, clock: () => new Date("2026-09-14T16:00:00Z") }), "canceled");
});

test("unsubscribe signatures reject tampering, wrong secrets, unicode and malformed tokens", () => {
  const token = unsubscribeToken({ id: "u1", email: "test@example.com" }, config.NOTIFICATION_UNSUBSCRIBE_SECRET);
  assert.equal(verifyUnsubscribeToken(token, config.NOTIFICATION_UNSUBSCRIBE_SECRET).userId, "u1");
  for (const bad of [undefined, "", token + "x", token + ".extra", "e30=.invalid", token.split(".")[0] + "." + "é".repeat(43)]) {
    assert.throws(() => verifyUnsubscribeToken(bad, config.NOTIFICATION_UNSUBSCRIBE_SECRET), { status: 400 });
  }
  assert.throws(() => verifyUnsubscribeToken(token, "wrong-secret"), { status: 400 });
});

test("unsubscribe is repeatable and cancels queued deliveries; preferences can re-enable", async () => {
  const f = fixture(); await enqueueNotifications(f.prisma, now);
  const token = unsubscribeToken(f.user, config.NOTIFICATION_UNSUBSCRIBE_SECRET);
  await unsubscribeNotifications(token, { prisma: f.prisma, config });
  await unsubscribeNotifications(token, { prisma: f.prisma, config });
  assert.equal(f.user.notificationPreference.emailEnabled, false);
  assert.equal(f.state.notificationDelivery[0].status, "CANCELED");
  assert.equal((await updateNotificationPreferences(f.user.id, { emailEnabled: true }, f)).emailEnabled, true);
  await assert.rejects(updateNotificationPreferences(f.user.id, { quietHoursEnabled: true, quietHoursStart: "08:00", quietHoursEnd: "08:00" }, f), { status: 400 });
  f.user.email = "new@example.com";
  await assert.rejects(unsubscribeNotifications(token, { prisma: f.prisma, config }), { status: 400 });
});

test("email escapes resource content, includes one-click controls and uses provider idempotency", async () => {
  const { state, user } = fixture();
  const payload = buildNotificationEmail({ kind: "UPCOMING_TASK", eventAt: now }, user, { ...state.task[0], title: '<script>alert("x")</script>' }, preferences, config);
  assert.ok(!payload.html.includes("<script>"));
  assert.match(payload.headers["List-Unsubscribe"], /^<https:\/\/api.example.com\/notifications\/unsubscribe\?token=/);
  assert.equal(payload.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.equal(await sendNotificationEmail(payload, "stable-key", { config, fetchImpl: async (_url, options) => {
    assert.equal(options.headers["Idempotency-Key"], "stable-key");
    assert.deepEqual(JSON.parse(options.body), payload);
    return { ok: true, json: async () => ({ id: "provider-id" }) };
  } }), "provider-id");
  await assert.rejects(sendNotificationEmail(payload, "k", { config: {}, fetchImpl: () => assert.fail("must not call provider") }));
  for (const [status, permanent] of [[422, true], [429, false], [409, false], [500, false]]) {
    await assert.rejects(sendNotificationEmail(payload, "k", { config, fetchImpl: async () => ({ ok: false, status }) }), { permanent });
  }
});

test("API protects preferences and cron, and GET unsubscribe never mutates state", async () => {
  const original = { secret: env.CRON_SECRET, unsubscribe: env.NOTIFICATION_UNSUBSCRIBE_SECRET };
  const f = fixture(); setPrismaForTests(f.prisma); const restoreAuth = mockManagedAuth(f.prisma);
  env.CRON_SECRET = "cron-secret"; env.NOTIFICATION_UNSUBSCRIBE_SECRET = config.NOTIFICATION_UNSUBSCRIBE_SECRET;
  const app = express(); app.use(express.json()); app.use("/notifications", notificationRoutes); app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/notifications`;
  try {
    assert.equal((await fetch(`${base}/preferences`)).status, 401);
    assert.equal((await fetch(`${base}/preferences`, { method: "PATCH", headers: { "content-type": "application/json" }, body: "{}" })).status, 401);
    const session = { accessToken: accessToken(f.user.id) };
    const headers = { authorization: `Bearer ${session.accessToken}`, "content-type": "application/json" };
    assert.equal((await fetch(`${base}/preferences`, { headers })).status, 200);
    const patched = await fetch(`${base}/preferences`, { method: "PATCH", headers, body: JSON.stringify({ timeZone: "Europe/London" }) });
    assert.equal(patched.status, 200);
    assert.equal((await patched.json()).preferences.timeZone, "Europe/London");
    assert.equal((await fetch(`${base}/preferences`, { method: "PATCH", headers, body: JSON.stringify({ userId: "someone-else", emailEnabled: false }) })).status, 400);
    assert.equal(f.user.notificationPreference.emailEnabled, true);
    assert.equal((await fetch(`${base}/maintenance/deliver`)).status, 401);
    assert.equal((await fetch(`${base}/maintenance/deliver`, { headers: { authorization: "Bearer wrong" } })).status, 401);
    env.CRON_SECRET = null;
    assert.equal((await fetch(`${base}/maintenance/deliver`)).status, 503);
    const url = `${base}/unsubscribe?token=${encodeURIComponent(unsubscribeToken(f.user, config.NOTIFICATION_UNSUBSCRIBE_SECRET))}`;
    assert.equal((await fetch(url)).status, 200);
    assert.equal(f.user.notificationPreference.emailEnabled, true);
    assert.equal((await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" })).status, 200);
    assert.equal(f.user.notificationPreference.emailEnabled, false);
    assert.equal((await fetch(`${base}/unsubscribe?token=invalid`, { method: "POST" })).status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve)); setPrismaForTests(null); restoreAuth();
    env.CRON_SECRET = original.secret; env.NOTIFICATION_UNSUBSCRIBE_SECRET = original.unsubscribe;
  }
});

test("worker fails closed before database or provider access when configuration is missing or unsafe", async () => {
  const prisma = new Proxy({}, { get: () => assert.fail("must not access database") });
  for (const overrides of [{ RESEND_API_KEY: null }, { NOTIFICATION_UNSUBSCRIBE_SECRET: null }, { API_PUBLIC_URL: undefined }, { APP_URL: "javascript:alert(1)" }, { NODE_ENV: "production", APP_URL: "http://app.example.com" }, { NODE_ENV: "production" }]) {
    await assert.rejects(runNotificationDelivery({ prisma, config: { ...config, ...overrides } }), { status: 503 });
  }
});
