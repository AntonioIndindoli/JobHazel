import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { getPrismaAsync } from "../db/prisma.js";
import { notificationProvider } from "./notification-provider.services.js";
import { publicPreferences, nextAllowedTime, localDay } from "./notification-policy.js";
import { DAY_MS, hashNotification, dailySlot, interviewIntent, localDayBoundary, buildDigest } from "./notification-digest.services.js";

export const ACTIVE_MODE = "daily-digest-scheduled-interviews";
const TERMINAL = ["SENT", "CANCELED", "SKIPPED", "FAILED"];
const RETRY_WINDOW = 23 * 3600000;
const USER_INCLUDE = { notificationPreference: true };
const INTERVIEW_INCLUDE = { application: { include: { company: true } } };
export const newNotificationsEnabled = (config = env) => config.NOTIFICATION_MODE === ACTIVE_MODE;
function requireNotificationConfiguration(config) {
  if (config.NOTIFICATION_MODE === "drain") {
    if (!config.RESEND_API_KEY) throw Object.assign(new Error("Resend credentials are required to cancel scheduled emails."), { status: 503 });
    return;
  }
  const validOrigin = (value) => {
    try {
      const url = new URL(value);
      return (config.NODE_ENV === "production" ? url.protocol === "https:" : ["http:", "https:"].includes(url.protocol)) && !url.username && !url.password && !url.search && !url.hash;
    } catch { return false; }
  };
  if (!config.RESEND_API_KEY || !config.NOTIFICATION_UNSUBSCRIBE_SECRET || !validOrigin(config.APP_URL) || !validOrigin(config.API_PUBLIC_URL) ||
    (config.NODE_ENV === "production" && (config.NOTIFICATION_UNSUBSCRIBE_SECRET.length < 32 || !config.RESEND_WEBHOOK_SECRET?.startsWith("whsec_")))) {
    throw Object.assign(new Error("Configure Resend, valid public origins and a stable unsubscribe secret before enabling reminders."), { status: 503 });
  }
}

// Called INSIDE the domain transaction, including while draining existing emails.
export async function markNotificationDirty(tx, userId, config = env) {
  if (!config.NOTIFICATION_MODE || config.NOTIFICATION_MODE === "legacy") return;
  await tx.notificationSync.upsert({ where: { userId }, create: { userId }, update: { revision: { increment: 1 }, cursor: null } });
}

export async function cancelNotificationOperations(tx, userId, where = {}, { erase = false } = {}) {
  // Cancellation/privacy obligations also survive an accidental legacy rollback.
  // Lightweight legacy test adapters do not expose this additive model.
  if (!tx.notificationOperation) return;
  await tx.notificationOperation.updateMany({ where: { userId, ...where }, data: {
    desired: false, nextAttemptAt: new Date(), ...(erase ? { payload: Prisma.DbNull, resourceId: null } : {}),
  } });
}

async function enrolled(prisma, userId, config) {
  const users = await prisma.user.findMany({ where: { emailVerifiedAt: { not: null }, notificationPreference: { is: { emailEnabled: true } } }, orderBy: { id: "asc" }, take: config.NOTIFICATION_COHORT_LIMIT ?? 5, select: { id: true } });
  return users.some((user) => user.id === userId);
}

// Serialized with preference edits and account deletion by the User lock.
export async function reconcileUser(prisma, userId, { config = env, now = new Date(), deadline = Infinity } = {}) {
  deadline = Math.min(deadline, Date.now() + 10000);
  const isEnrolled = newNotificationsEnabled(config) && await enrolled(prisma, userId, config);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId }, include: USER_INCLUDE });
    if (!user) return;
    const sync = await tx.notificationSync.findUnique({ where: { userId } });
    const p = publicPreferences(user.notificationPreference);
    if (!isEnrolled || !user.emailVerifiedAt || !p.emailEnabled || !newNotificationsEnabled(config)) {
      await cancelNotificationOperations(tx, userId, {}, { config });
    } else {
      // Resume a bounded source scan. Domain writes reset the cursor atomically.
      const interviews = await tx.interview.findMany({ where: { userId, ...(sync?.cursor ? { id: { gt: sync.cursor } } : {}) }, include: INTERVIEW_INCLUDE, orderBy: { id: "asc" }, take: 100 });
      let cursor = sync?.cursor ?? null;
      for (const interview of interviews) {
        if (Date.now() >= deadline) {
          await tx.notificationSync.upsert({ where: { userId }, create: { userId, cursor }, update: { cursor } });
          return;
        }
        const intent = interviewIntent(user, interview, now, config);
        cursor = interview.id;
        if (!intent) {
          await cancelNotificationOperations(tx, userId, { kind: "INTERVIEW_REMINDER", resourceId: interview.id }, { config });
          continue;
        }
        const family = await tx.notificationOperation.findMany({ where: { userId, resourceId: interview.id, kind: "INTERVIEW_REMINDER", OR: [{ desired: true }, { status: "SENT", eventAt: interview.scheduledAt }] }, orderBy: { createdAt: "desc" } });
        const same = family.find((op) => op.desired && op.revision === intent.revision);
        if (same) continue;
        // A sent reminder suppresses cosmetic changes for this occurrence.
        const sent = family.some((op) => op.status === "SENT" && +op.eventAt === +interview.scheduledAt);
        const legacy = await tx.notificationDelivery.findFirst({ where: { userId, kind: "INTERVIEW_REMINDER", resourceId: interview.id, eventAt: interview.scheduledAt, status: { in: ["SENT", "PROCESSING", "UNKNOWN"] } } });
        await cancelNotificationOperations(tx, userId, { kind: "INTERVIEW_REMINDER", resourceId: interview.id }, { config });
        if (sent || legacy) continue;
        await tx.notificationOperation.create({ data: {
          userId, kind: "INTERVIEW_REMINDER", resourceId: interview.id,
          familyKey: hashNotification([userId, "interview", interview.id]), ...intent,
          nextAttemptAt: new Date(Math.max(+now, +intent.sendAt - 7 * DAY_MS)),
        } });
      }
      if (interviews.length === 100) {
        await tx.notificationSync.upsert({ where: { userId }, create: { userId, cursor }, update: { cursor } });
        return;
      }
    }
    if (sync) await tx.notificationSync.deleteMany({ where: { userId, revision: sync.revision } });
  }, { timeout: 15000 });
}

export async function enqueueDigest(prisma, userId, now, config = env) {
  const slot = dailySlot(now);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId }, include: USER_INCLUDE });
    if (!user?.emailVerifiedAt) return;
    const p = publicPreferences(user.notificationPreference);
    if (!p.emailEnabled || (!p.upcomingTasks && !p.overdueTasks)) return;
    const digestKey = hashNotification([userId, "digest", slot.id]);
    if (await tx.notificationOperation.findUnique({ where: { digestKey } })) return;
    const day = localDay(now, p.timeZone);
    const start = localDayBoundary(day, p.timeZone);
    const tomorrow = localDayBoundary(day + 1, p.timeZone);
    const end = localDayBoundary(day + p.taskReminderDays + 1, p.timeZone);
    const ranges = { today: p.upcomingTasks ? { gte: start, lt: tomorrow } : null,
      overdue: p.overdueTasks ? { lt: start } : null,
      upcoming: p.upcomingTasks && p.taskReminderDays > 0 ? { gte: tomorrow, lt: end } : null };
    const sections = { today: [], overdue: [], upcoming: [] };
    const totals = { today: 0, overdue: 0, upcoming: 0 };
    let remaining = 20;
    for (const [section, range] of Object.entries(ranges)) {
      if (!range) continue;
      const where = { userId, completedAt: null, dueDate: range };
      totals[section] = await tx.task.count({ where });
      if (remaining) sections[section] = await tx.task.findMany({ where, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: remaining });
      remaining -= sections[section].length;
    }
    const sendAt = nextAllowedTime(now, p);
    const empty = !Object.values(sections).some((tasks) => tasks.length);
    await tx.notificationOperation.create({ data: {
      userId, kind: "TASK_DIGEST", familyKey: digestKey, digestKey, revision: digestKey,
      sendAt, expiresAt: slot.end, eventAt: now,
      status: empty || sendAt >= slot.end ? "SKIPPED" : "PENDING",
      payload: empty || sendAt >= slot.end ? Prisma.DbNull : buildDigest(user, sections, now, config, totals),
    } });
  });
}

export async function applyProviderOutcome(prisma, id, event, eventAt) {
  const sent = ["sent", "delivered", "bounced", "complained", "opened", "clicked", "delivery_delayed"].includes(event);
  const failed = ["failed", "suppressed"].includes(event);
  const data = { providerEvent: event, providerEventAt: eventAt };
  if (sent) Object.assign(data, { status: "SENT", sentAt: eventAt, payload: Prisma.DbNull, lastError: null });
  if (event === "delivered") data.deliveredAt = eventAt;
  if (failed) Object.assign(data, { status: "FAILED", payload: Prisma.DbNull, lastError: `Provider outcome: ${event}.` });
  if (event === "canceled") Object.assign(data, { status: "CANCELED", payload: Prisma.DbNull, lastError: null });
  await prisma.notificationOperation.updateMany({ where: { id, OR: [{ providerEventAt: null }, { providerEventAt: { lt: eventAt } }] }, data });
}

async function replayProviderEvents(prisma, operation) {
  const events = await prisma.notificationProviderEvent.findMany({ where: { providerId: operation.providerId }, orderBy: { eventAt: "asc" } });
  for (const event of events) await applyProviderOutcome(prisma, operation.id, event.type, event.eventAt);
}

export async function processOperation(id, { prisma, config = env, clock = () => new Date(), provider = notificationProvider({ config }) } = {}) {
  const now = clock();
  const token = crypto.randomUUID();
  const claimed = await prisma.notificationOperation.updateMany({ where: { id, nextAttemptAt: { lte: now },
    OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }], status: { notIn: TERMINAL } },
    data: { leaseToken: token, leaseUntil: new Date(+now + 60000) } });
  if (!claimed.count) return "skipped";
  const save = (data) => prisma.notificationOperation.updateMany({ where: { id, leaseToken: token }, data });
  const finish = async (data, result) => { await save({ ...data, leaseToken: null, leaseUntil: null }); return result; };
  let op = await prisma.notificationOperation.findUnique({ where: { id } });
  try {
    if (op.providerId) {
      await replayProviderEvents(prisma, op);
      op = await prisma.notificationOperation.findUnique({ where: { id } });
      if (TERMINAL.includes(op.status)) return finish({}, op.status.toLowerCase());
    }
    // Revalidate source/preferences before every first attempt, not just discovery.
    if (op.desired && op.userId) {
      const user = await prisma.user.findUnique({ where: { id: op.userId }, include: USER_INCLUDE });
      const p = publicPreferences(user?.notificationPreference);
      let valid = user?.emailVerifiedAt && p.emailEnabled && newNotificationsEnabled(config);
      if (valid && op.kind === "INTERVIEW_REMINDER") {
        const interview = await prisma.interview.findFirst({ where: { id: op.resourceId, userId: op.userId }, include: INTERVIEW_INCLUDE });
        valid = interview && interviewIntent(user, interview, clock(), config)?.revision === op.revision;
      }
      if (!valid) { await save({ desired: false }); op.desired = false; }
    }
    if (!op.userId || !newNotificationsEnabled(config) || +op.expiresAt <= +clock()) {
      await save({ desired: false }); op.desired = false;
    }
    if (!op.desired && op.providerId) {
      await save({ status: "CANCEL_PENDING" });
      try { await provider.cancel(op.providerId); }
      catch (error) {
        const outcome = await provider.retrieve(op.providerId);
        if (["sent", "delivered", "bounced", "failed", "suppressed", "canceled", "opened", "clicked", "complained"].includes(outcome.last_event)) {
          await applyProviderOutcome(prisma, id, outcome.last_event, clock());
          return finish({}, outcome.last_event);
        }
        throw error;
      }
      return finish({ status: "CANCELED", payload: Prisma.DbNull, lastError: null }, "canceled");
    }
    if (!op.desired && !op.firstAttemptAt) return finish({ status: "CANCELED", payload: Prisma.DbNull }, "canceled");
    if (op.providerId) {
      const outcome = await provider.retrieve(op.providerId);
      await applyProviderOutcome(prisma, id, outcome.last_event, clock());
      return finish({ nextAttemptAt: new Date(+clock() + DAY_MS) }, "reconciled");
    }
    if (op.firstAttemptAt && (+clock() - +op.firstAttemptAt >= RETRY_WINDOW || !op.payload || !op.desired)) {
      // Never resurrect canceled content just to obtain an ID. A signed webhook
      // can recover the ID, otherwise an operator must reconcile provider logs.
      return finish({ status: "UNKNOWN", lastError: "Provider acceptance is unknown; automatic creation retry stopped.", payload: Prisma.DbNull }, "unknown");
    }
    if (+op.sendAt > +clock() + 7 * DAY_MS) return finish({ nextAttemptAt: new Date(+op.sendAt - 7 * DAY_MS) }, "deferred");
    // Old uncertain revisions must be resolved before replacements are created.
    const blocker = await prisma.notificationOperation.findFirst({ where: { familyKey: op.familyKey, id: { not: id }, desired: false, status: { notIn: TERMINAL } } });
    if (blocker) return finish({ nextAttemptAt: new Date(+clock() + 60000), lastError: "Previous reminder cancellation needs reconciliation." }, "pending");
    if (!op.payload) return finish({ status: "FAILED", lastError: "Missing reminder payload." }, "failed");
    const payload = op.firstAttemptAt ? op.payload : {
      ...Object.fromEntries(Object.entries(op.payload).filter(([key]) => !["scheduled_at", "tags"].includes(key))),
      ...(+op.sendAt > +clock() + 1000 ? { scheduled_at: op.sendAt.toISOString() } : {}),
      tags: [{ name: "notification", value: id }],
    };
    const prepared = await prisma.notificationOperation.updateMany({ where: { id, leaseToken: token, desired: true }, data: {
      payload, firstAttemptAt: op.firstAttemptAt ?? clock(), attempts: { increment: 1 }, status: "PROCESSING",
    } });
    if (!prepared.count) return finish({}, "skipped");
    const result = await provider.schedule(payload, `notification-v2/${id}`);
    // Persist the receipt even when the source was canceled/deleted during send.
    // No FK cascade can erase this row. Do not overwrite a webhook's outcome.
    await prisma.notificationOperation.updateMany({ where: { id, providerId: null }, data: { providerId: result.id, payload: Prisma.DbNull } });
    const latest = await prisma.notificationOperation.findUnique({ where: { id } });
    if (!TERMINAL.includes(latest.status)) await save({ status: latest.desired && latest.userId ? "SCHEDULED" : "CANCEL_PENDING", nextAttemptAt: latest.desired ? new Date(Math.max(+clock() + DAY_MS, +op.sendAt)) : clock(), lastError: null });
    if (!latest.desired || !latest.userId) {
      // Compensate immediately when a deletion/edit won the race with acceptance.
      await provider.cancel(result.id);
      return finish({ status: "CANCELED", payload: Prisma.DbNull }, "canceled");
    }
    return finish({}, TERMINAL.includes(latest.status) ? latest.status.toLowerCase() : "scheduled");
  } catch (error) {
    // A DB acknowledgement failure also lands here with immutable request data.
    const latest = await prisma.notificationOperation.findUnique({ where: { id } });
    if (TERMINAL.includes(latest.status)) return finish({}, latest.status.toLowerCase());
    const permanent = error.permanent && !latest.providerId && latest.desired;
    return finish({ status: permanent ? "FAILED" : latest.providerId && !latest.desired ? "CANCEL_PENDING" : latest.status === "UNKNOWN" ? "UNKNOWN" : "PENDING",
      nextAttemptAt: new Date(+clock() + Math.max(error.retryAfterMs ?? 60000, 60000)),
      lastError: permanent ? "Provider rejected reminder." : "Reminder operation needs retry or reconciliation.",
      ...(error.safeToRetry && !op.firstAttemptAt ? { firstAttemptAt: null } : {}),
      ...(permanent ? { payload: Prisma.DbNull } : {}),
    }, permanent ? "failed" : "pending");
  }
}

export async function notificationStatus(prisma, userId, config = env) {
  const now = new Date();
  const [pending, unknown, failed, dirty] = await Promise.all([
    prisma.notificationOperation.count({ where: { userId, status: { notIn: TERMINAL }, OR: [{ desired: false }, { providerId: null, nextAttemptAt: { lte: now } }] } }),
    prisma.notificationOperation.count({ where: { userId, status: "UNKNOWN" } }),
    prisma.notificationOperation.count({ where: { userId, desired: true, status: "FAILED" } }),
    prisma.notificationSync.count({ where: { userId } }),
  ]);
  const user = await prisma.user.findUnique({ where: { id: userId }, include: USER_INCLUDE });
  const capacityLimited = newNotificationsEnabled(config) && !!user?.notificationPreference?.emailEnabled && !(await enrolled(prisma, userId, config));
  return { mode: config.NOTIFICATION_MODE, pending: pending + dirty, unknown, failed, capacityLimited, needsAttention: !!(pending + unknown + failed + dirty) || capacityLimited };
}

export async function drainOperations(prisma, { config = env, userId, deadline = Date.now() + 20000, clock = () => new Date(), provider, allowCreate = true } = {}) {
  const counts = {};
  const seen = new Set();
  const servedUsers = new Set();
  while (Date.now() + 11000 < deadline) {
    const fairness = servedUsers.size ? { OR: [
      ...(!servedUsers.has(null) ? [{ userId: null }] : []),
      { userId: { not: null, notIn: [...servedUsers].filter((id) => id !== null) } },
    ] } : {};
    const candidates = await prisma.notificationOperation.findMany({ where: {
      ...(userId ? { userId } : {}), status: { notIn: TERMINAL }, nextAttemptAt: { lte: clock() },
      AND: [{ OR: [{ status: { not: "UNKNOWN" } }, { providerId: { not: null } }] }, fairness],
      ...(allowCreate ? {} : { desired: false }),
      ...(seen.size ? { id: { notIn: [...seen] } } : {}),
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: clock() } }],
    }, orderBy: [{ desired: "asc" }, { sendAt: "asc" }, { id: "asc" }], take: 1 });
    if (!candidates.length) {
      if (servedUsers.size) { servedUsers.clear(); continue; }
      break;
    }
    const op = candidates[0]; seen.add(op.id); servedUsers.add(op.userId);
    const result = await processOperation(op.id, { prisma, config, clock, provider });
    counts[result] = (counts[result] ?? 0) + 1;
    // Leave headroom for other account traffic. HTTP 429 persists Retry-After
    // when concurrent request handlers consume the shared provider budget.
    const interval = config.NOTIFICATION_PROVIDER_INTERVAL_MS ?? 200;
    if (Date.now() + interval < deadline) await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return counts;
}

export async function flushUserNotifications(userId, { prisma, config = env, ...options } = {}) {
  if (!config.NOTIFICATION_MODE || config.NOTIFICATION_MODE === "legacy") return { mode: "legacy", needsAttention: false };
  prisma ??= await getPrismaAsync();
  try {
    if (newNotificationsEnabled(config)) requireNotificationConfiguration(config);
    const deadline = Date.now() + 20000;
    await reconcileUser(prisma, userId, { config, deadline });
    await drainOperations(prisma, { config, userId, deadline, ...options });
    return await notificationStatus(prisma, userId, config);
  } catch {
    return { mode: config.NOTIFICATION_MODE, needsAttention: true, pending: 1, message: "Reminder scheduling needs attention. Retry in notification settings." };
  }
}

export async function runDailyNotifications({ prisma, config = env, clock = () => new Date(), provider } = {}) {
  prisma ??= await getPrismaAsync();
  requireNotificationConfiguration(config);
  const deadline = Date.now() + (config.NOTIFICATION_RUN_BUDGET_MS ?? 45000);
  const now = clock(); const slot = dailySlot(now);
  // Legacy attempted work is never silently reset into the new sender.
  const legacyActive = await prisma.notificationDelivery.count({ where: { status: "PROCESSING", leaseUntil: { gt: now } } });
  if (legacyActive) throw Object.assign(new Error("Wait for legacy notification leases before cutover."), { status: 503 });
  await prisma.notificationDelivery.updateMany({ where: { status: "PENDING", firstAttemptAt: null }, data: { status: "CANCELED", payload: Prisma.DbNull } });
  await prisma.notificationDelivery.updateMany({ where: { status: { in: ["PENDING", "PROCESSING"] }, firstAttemptAt: { not: null } }, data: { status: "UNKNOWN" } });
  if (!newNotificationsEnabled(config)) await prisma.notificationOperation.updateMany({ where: { desired: true, status: { notIn: TERMINAL } }, data: { desired: false, nextAttemptAt: now } });
  await prisma.notificationOperation.updateMany({ where: { desired: true, expiresAt: { lte: now } }, data: { desired: false, nextAttemptAt: now } });
  const counts = await drainOperations(prisma, { config, deadline: Math.min(deadline, Date.now() + 12000), clock, provider, allowCreate: false });
  const run = await prisma.notificationRun.upsert({ where: { id: slot.id }, create: { id: slot.id }, update: {} });
  let discoveryComplete = !!run.completedAt;
  if (newNotificationsEnabled(config) && !run.completedAt) {
    const cohort = await prisma.user.findMany({ where: { emailVerifiedAt: { not: null }, notificationPreference: { is: { emailEnabled: true } } }, orderBy: { id: "asc" }, take: config.NOTIFICATION_COHORT_LIMIT ?? 5, select: { id: true } });
    discoveryComplete = true;
    for (const user of cohort.filter((u) => !run.cursor || u.id > run.cursor)) {
      if (Date.now() + 5500 >= deadline) { discoveryComplete = false; break; }
      await reconcileUser(prisma, user.id, { config, now: clock(), deadline });
      await enqueueDigest(prisma, user.id, clock(), config);
      await prisma.notificationRun.update({ where: { id: slot.id }, data: { cursor: user.id } });
    }
  }
  // Changes that failed their request-time attempt must be reconciled, even if
  // this daily slot's discovery has already completed.
  const dirty = await prisma.notificationSync.findMany({ orderBy: { updatedAt: "asc" }, take: 100 });
  for (const item of dirty) {
    if (Date.now() + 5500 >= deadline) break;
    await reconcileUser(prisma, item.userId, { config, now: clock(), deadline });
  }
  const drained = await drainOperations(prisma, { config, deadline, clock, provider });
  for (const [key, value] of Object.entries(drained)) counts[key] = (counts[key] ?? 0) + value;
  const backlog = await prisma.notificationOperation.count({ where: { status: { notIn: TERMINAL }, OR: [{ desired: false }, { providerId: null, nextAttemptAt: { lte: clock() } }] } });
  const dirtyCount = await prisma.notificationSync.count();
  const unknown = await prisma.notificationOperation.count({ where: { status: "UNKNOWN" } });
  const failed = await prisma.notificationOperation.count({ where: { desired: true, status: "FAILED" } });
  const eligibleUsers = await prisma.user.count({ where: { emailVerifiedAt: { not: null }, notificationPreference: { is: { emailEnabled: true } } } });
  const oldest = await prisma.notificationOperation.findFirst({ where: { status: { notIn: TERMINAL }, providerId: null, nextAttemptAt: { lte: clock() } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  const incomplete = !discoveryComplete || !!(backlog + dirtyCount + unknown + failed);
  if (!incomplete) await prisma.notificationRun.update({ where: { id: slot.id }, data: { completedAt: clock() } });
  // Retain dedupe operation rows for existing users; remove only resolved,
  // anonymous tombstones and raw-free webhook receipts after 30 days.
  await prisma.notificationOperation.deleteMany({ where: { userId: null, status: { in: TERMINAL }, updatedAt: { lt: new Date(+now - 30 * DAY_MS) } } });
  await prisma.notificationProviderEvent.deleteMany({ where: { createdAt: { lt: new Date(+now - 30 * DAY_MS) } } });
  return { ...counts, incomplete, backlog, dirty: dirtyCount, unknown, failed, excludedUsers: Math.max(0, eligibleUsers - (config.NOTIFICATION_COHORT_LIMIT ?? 5)), oldestPendingAgeSeconds: oldest ? Math.max(0, Math.floor((+clock() - +oldest.createdAt) / 1000)) : 0, runDate: slot.id, completedAt: incomplete ? null : clock() };
}
