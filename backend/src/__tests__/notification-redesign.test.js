import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { Webhook } from "svix";
import { dailySlot, interviewIntent, digestSections, buildDigest } from "../services/notification-digest.services.js";
import { DEFAULT_NOTIFICATION_PREFERENCES as defaults } from "../services/notification-policy.js";
import { notificationProvider } from "../services/notification-provider.services.js";
import { processOperation, applyProviderOutcome } from "../services/notification-operations.services.js";
import { handleNotificationWebhook } from "../services/notification-webhook.services.js";

const now = new Date("2026-09-21T16:00:00Z");
const config = { NOTIFICATION_MODE: "daily-digest-scheduled-interviews", RESEND_API_KEY: "test", EMAIL_FROM: "test@example.com", APP_URL: "https://example.com", API_PUBLIC_URL: "https://api.example.com", NOTIFICATION_UNSUBSCRIBE_SECRET: "test-secret" };
const user = { id: "user", email: "user@example.com", emailVerifiedAt: now, notificationPreference: { ...defaults, emailEnabled: true } };
const interview = { id: "interview", userId: user.id, scheduledAt: new Date(+now + 2 * 86400000), outcome: "SCHEDULED", application: { title: "Engineer", company: { name: "Example" } } };

test("daily slot survives midnight and expires at the next nominal run", () => {
  assert.equal(dailySlot(new Date("2026-09-22T00:01:00Z")).id, "2026-09-21");
  assert.equal(dailySlot(new Date("2026-09-22T15:06:59Z")).id, "2026-09-21");
  assert.equal(dailySlot(new Date("2026-09-22T15:07:00Z")).id, "2026-09-22");
});
test("interviews schedule in advance, late intent has stable identity, and quiet hours never push past the interview", () => {
  const intent = interviewIntent(user, interview, now, config);
  assert.equal(+intent.sendAt, +interview.scheduledAt - 3600000);
  const late = { ...interview, scheduledAt: new Date(+now + 600000) };
  assert.equal(interviewIntent(user, late, now, config).revision, interviewIntent(user, late, new Date(+now + 1000), config).revision);
  assert.equal(interviewIntent(user, { ...interview, outcome: "CANCELED" }, now, config), null);
  assert.equal(interviewIntent(user, { ...interview, scheduledAt: now }, now, config), null);
  const quiet = { ...user, notificationPreference: { ...user.notificationPreference, quietHoursEnabled: true, quietHoursStart: "15:00", quietHoursEnd: "18:00" } };
  assert.equal(interviewIntent(quiet, late, now, config), null);
});
test("digest groups local days, repeats open overdue tasks, escapes content and caps the visible list", () => {
  const tasks = Array.from({ length: 25 }, (_, i) => ({ id: String(i).padStart(2, "0"), title: `<task-${i}>`, dueDate: now, completedAt: null }));
  tasks.push({ id: "old", title: "Old", dueDate: new Date(+now - 86400000) });
  tasks.push({ id: "complete", title: "Complete", dueDate: now, completedAt: now });
  tasks.push({ id: "undated", title: "Undated", dueDate: null });
  const sections = digestSections(tasks, user.notificationPreference, now);
  assert.equal(sections.today.length, 25); assert.equal(sections.overdue.length, 1);
  const email = buildDigest(user, sections, now, config);
  assert.ok(email.text.includes("Due today (25)")); assert.ok(email.text.includes("Overdue (1)"));
  assert.ok(email.html.includes("&lt;task-0&gt;")); assert.ok(!email.text.includes("<task-20>"));
  assert.ok(email.headers["List-Unsubscribe"]); assert.ok(email.text.includes("snapshot"));
  assert.equal(digestSections(tasks, user.notificationPreference, new Date(+now + 86400000)).overdue.length, 26);
  const p = { ...user.notificationPreference, timeZone: "America/Los_Angeles" };
  assert.equal(digestSections([{ id: "dst", title: "DST", dueDate: new Date("2026-03-08T09:00Z") }], p, new Date("2026-03-09T06:59Z")).today.length, 1);
});
test("provider uses immutable schedule parameters, typed failures and cancellation endpoint", async () => {
  const calls = [];
  const provider = notificationProvider({ config, fetchImpl: async (url, init) => { calls.push({ url, ...init }); return new Response(JSON.stringify({ id: "provider" })); } });
  await provider.schedule({ scheduled_at: interview.scheduledAt.toISOString() }, "stable-key");
  await provider.cancel("provider");
  assert.equal(calls[0].headers["Idempotency-Key"], "stable-key");
  assert.equal(JSON.parse(calls[0].body).scheduled_at, interview.scheduledAt.toISOString());
  assert.ok(calls[1].url.endsWith("/provider/cancel"));
  await assert.rejects(notificationProvider({ config, fetchImpl: async () => new Response("", { status: 429, headers: { "Retry-After": "90" } }) }).schedule({}, "k"), (e) => e.retryAfterMs === 90000 && !e.permanent);
});

function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((clause) => matches(row, clause));
    const actual = row[key];
    if (value instanceof Date) return +actual === +value;
    if (value && typeof value === "object") return Object.entries(value).every(([op, v]) => {
      if (op === "notIn") return !v.includes(actual);
      if (op === "in") return v.includes(actual);
      if (op === "not") return actual !== v;
      if (op === "lte") return actual != null && actual <= v;
      if (op === "lt") return actual != null && actual < v;
      throw Error(op);
    });
    return actual === value;
  });
}
function operationFixture() {
  const intent = interviewIntent(user, interview, now, config);
  const row = { id: "op", userId: user.id, resourceId: interview.id, kind: "INTERVIEW_REMINDER", familyKey: "family", status: "PENDING", desired: true, providerId: null, firstAttemptAt: null, leaseUntil: null, leaseToken: null, nextAttemptAt: now, attempts: 0, providerEventAt: null, ...intent };
  const rows = [row]; const events = [];
  const prisma = {
    notificationOperation: {
      findUnique: async ({ where }) => structuredClone(rows.find((item) => matches(item, where))),
      findFirst: async ({ where }) => structuredClone(rows.find((item) => matches(item, where))),
      async updateMany({ where, data }) { let count = 0; for (const item of rows.filter((item) => matches(item, where))) { for (const [k, v] of Object.entries(data)) item[k] = v === Prisma.DbNull ? null : v?.increment ? item[k] + v.increment : v; count++; } return { count }; },
    },
    user: { findUnique: async () => structuredClone(user) },
    interview: { findFirst: async () => structuredClone(interview) },
    notificationProviderEvent: { findMany: async () => events, createMany: async ({ data }) => events.push(...data) },
  };
  prisma.$transaction = (fn) => fn(prisma);
  let sent = 0;
  const provider = { schedule: async () => ({ id: `provider-${++sent}` }), cancel: async () => ({}), retrieve: async () => ({ id: row.providerId, last_event: "scheduled" }) };
  return { row, rows, prisma, provider, options: { prisma, provider, config, clock: () => now } };
}
test("concurrent claims schedule once; accepted scheduling is not SENT", async () => {
  const f = operationFixture();
  assert.deepEqual((await Promise.all([processOperation("op", f.options), processOperation("op", f.options)])).sort(), ["scheduled", "skipped"]);
  assert.equal(f.row.status, "SCHEDULED"); assert.equal(f.row.sentAt, undefined);
});
test("unknown acceptance retries identical payload inside 23 hours and stops outside it", async () => {
  const f = operationFixture(); let payload;
  f.provider.schedule = async (p) => { payload = structuredClone(p); throw Error("timeout after acceptance"); };
  assert.equal(await processOperation("op", f.options), "pending");
  f.provider.schedule = async (p) => { assert.deepEqual(p, payload); return { id: "receipt" }; };
  assert.equal(await processOperation("op", { ...f.options, clock: () => new Date(+now + 120000) }), "scheduled");
  const g = operationFixture(); g.row.firstAttemptAt = now; g.row.status = "PROCESSING";
  g.provider.schedule = async () => { throw Error("must not send"); };
  assert.equal(await processOperation("op", { ...g.options, clock: () => new Date(+now + 24 * 3600000) }), "unknown");
});
test("cancellation uses known provider ID after retry window and blocks replacement until confirmed", async () => {
  const f = operationFixture(); f.row.desired = false; f.row.providerId = "receipt"; f.row.firstAttemptAt = new Date(+now - 30 * 3600000);
  let canceled = 0; f.provider.cancel = async () => { canceled++; };
  assert.equal(await processOperation("op", f.options), "canceled"); assert.equal(canceled, 1);
  const g = operationFixture(); g.rows.push({ ...g.row, id: "old", desired: false, status: "UNKNOWN" });
  assert.equal(await processOperation("op", g.options), "pending"); assert.equal(g.row.providerId, null);
});
test("deletion during provider request retains receipt and cancellation obligation without recipient payload", async () => {
  const f = operationFixture(); f.provider.schedule = async () => { f.row.userId = null; f.row.desired = false; f.row.payload = null; return { id: "late-receipt" }; };
  await processOperation("op", f.options);
  assert.equal(f.row.providerId, "late-receipt"); assert.equal(f.row.payload, null);
  assert.equal(f.row.status, "CANCELED");
});
test("out-of-order provider outcomes cannot undo delivery", async () => {
  const f = operationFixture();
  await applyProviderOutcome(f.prisma, "op", "delivered", new Date(+now + 1000));
  await applyProviderOutcome(f.prisma, "op", "scheduled", now);
  assert.equal(f.row.status, "SENT"); assert.equal(f.row.providerEvent, "delivered");
});
test("a webhook winning the race with a timeout is not reset to pending", async () => {
  const f = operationFixture();
  f.provider.schedule = async () => {
    await applyProviderOutcome(f.prisma, "op", "sent", now);
    throw Error("response lost after sent webhook");
  };
  assert.equal(await processOperation("op", f.options), "sent");
  assert.equal(f.row.status, "SENT");
});
test("a definitive first rate-limit rejection does not consume the ambiguous retry window", async () => {
  const f = operationFixture();
  f.provider.schedule = async () => { throw Object.assign(Error("429"), { safeToRetry: true, retryAfterMs: 90000 }); };
  assert.equal(await processOperation("op", f.options), "pending");
  assert.equal(f.row.firstAttemptAt, null);
  assert.equal(+f.row.nextAttemptAt, +now + 90000);
});
test("signed webhooks recover orphan receipts and reject forged bodies", async () => {
  const f = operationFixture();
  const secret = `whsec_${Buffer.from("webhook-test-secret").toString("base64")}`;
  const body = JSON.stringify({ type: "email.scheduled", created_at: now.toISOString(), data: { email_id: "recovered", tags: { notification: "op" } } });
  const timestamp = new Date();
  const headers = { "svix-id": "event-id", "svix-timestamp": String(Math.floor(+timestamp / 1000)), "svix-signature": new Webhook(secret).sign("event-id", timestamp, body) };
  await handleNotificationWebhook(body, headers, { prisma: f.prisma, config: { ...config, RESEND_WEBHOOK_SECRET: secret } });
  assert.equal(f.row.providerId, "recovered");
  await assert.rejects(handleNotificationWebhook(body + " ", headers, { prisma: f.prisma, config: { ...config, RESEND_WEBHOOK_SECRET: secret } }), { status: 400 });
});
