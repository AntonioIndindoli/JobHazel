import { markNotificationDirty, cancelNotificationOperations, runDailyNotifications } from "./notification-operations.services.js";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { getPrismaAsync } from "../db/prisma.js";
import { buildNotificationEmail, sendNotificationEmail } from "./notification-email.services.js";
import { eligibleKind, nextAllowedTime, notificationKey, publicPreferences, validateNotificationPreferences, verifyUnsubscribeToken } from "./notification-policy.js";

const USER_SELECT = { id: true, email: true, emailVerifiedAt: true, notificationPreference: true };
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000; // Stay inside Resend's 24-hour deduplication window.
const LEASE_MS = 2 * 60 * 1000;

export async function getNotificationPreferences(userId, { prisma } = {}) {
  prisma ??= await getPrismaAsync();
  return publicPreferences(await prisma.notificationPreference.findUnique({ where: { userId } }));
}

export async function updateNotificationPreferences(userId, body, { prisma } = {}) {
  prisma ??= await getPrismaAsync();
  const data = validateNotificationPreferences(body);
  return prisma.$transaction(async (tx) => {
    // Serialize preference edits (including unsubscribe) for the same user.
    const users = await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    if (!users.length) throw Object.assign(new Error("Account not found."), { status: 404 });
    const current = await tx.notificationPreference.findUnique({ where: { userId } });
    const merged = { ...publicPreferences(current), ...data };
    if (merged.quietHoursEnabled && merged.quietHoursStart === merged.quietHoursEnd) {
      throw Object.assign(new Error("Quiet hours must have different start and end times."), { status: 400 });
    }
    const saved = await tx.notificationPreference.upsert({ where: { userId }, create: { userId, ...merged }, update: data });
    await markNotificationDirty(tx, userId);
    if (Object.keys(data).some((key) => publicPreferences(current)[key] !== data[key])) await cancelNotificationOperations(tx, userId, { kind: "TASK_DIGEST" });
    if (data.emailEnabled === false) {
      await cancelNotificationOperations(tx, userId);
      await tx.notificationDelivery.updateMany({ where: { userId, status: { in: ["PENDING", "PROCESSING"] } },
        data: { status: "CANCELED", leaseUntil: null, leaseToken: null, payload: Prisma.DbNull } });
    } else {
      // Re-evaluate deferrals after quiet hours, time zone or category changes.
      await tx.notificationDelivery.updateMany({ where: { userId, status: "PENDING", firstAttemptAt: null }, data: { nextAttemptAt: new Date() } });
    }
    return publicPreferences(saved);
  });
}

export async function unsubscribeNotifications(token, { prisma, config = env } = {}) {
  const data = verifyUnsubscribeToken(token, config.NOTIFICATION_UNSUBSCRIBE_SECRET);
  prisma ??= await getPrismaAsync();
  await prisma.$transaction(async (tx) => {
    const users = await tx.$queryRaw`SELECT "id", "email" FROM "User" WHERE "id" = ${data.userId} FOR UPDATE`;
    if (!users.length || users[0].email !== data.email) throw Object.assign(new Error("This unsubscribe link is no longer valid."), { status: 400 });
    await tx.notificationPreference.upsert({ where: { userId: data.userId }, create: { userId: data.userId, emailEnabled: false }, update: { emailEnabled: false } });
    await cancelNotificationOperations(tx, data.userId, {}, { config });
    await markNotificationDirty(tx, data.userId, config);
    await tx.notificationDelivery.updateMany({
      where: { userId: data.userId, status: { in: ["PENDING", "PROCESSING"] } },
      data: { status: "CANCELED", leaseUntil: null, leaseToken: null, payload: Prisma.DbNull },
    });
  });
  return data.userId;
}

async function* pages(model, args) {
  let cursor;
  while (true) {
    const records = await model.findMany({ ...args, orderBy: { id: "asc" }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!records.length) return;
    yield records;
    if (records.length < 100) return;
    cursor = records.at(-1).id;
  }
}

export async function enqueueNotifications(prisma, now) {
  let queued = 0;
  for await (const users of pages(prisma.user, { where: { emailVerifiedAt: { not: null }, notificationPreference: { is: { emailEnabled: true } } }, select: USER_SELECT })) {
    for (const user of users) {
      const preferences = publicPreferences(user.notificationPreference);
      const nextAttemptAt = nextAllowedTime(now, preferences);
      for (const interview of [false, true]) {
        if (interview ? !preferences.interviewReminders : !preferences.upcomingTasks && !preferences.overdueTasks) continue;
        const where = interview ? {
          userId: user.id, outcome: "SCHEDULED", scheduledAt: { gt: now, lte: new Date(now.getTime() + preferences.interviewReminderMinutes * 60000) },
        } : { userId: user.id, completedAt: null, dueDate: { not: null, lt: new Date(now.getTime() + (preferences.taskReminderDays + 2) * 86400000) } };
        for await (const resources of pages(interview ? prisma.interview : prisma.task, { where })) {
          const data = resources.flatMap((resource) => {
            const kind = eligibleKind(resource, preferences, now, interview);
            if (!kind) return [];
            const eventAt = interview ? resource.scheduledAt : resource.dueDate;
            return [{ userId: user.id, kind, resourceId: resource.id, eventAt,
              dedupeKey: notificationKey(user.id, kind, resource.id, eventAt), nextAttemptAt }];
          });
          if (data.length) queued += (await prisma.notificationDelivery.createMany({ data, skipDuplicates: true })).count;
        }
      }
    }
  }
  return queued;
}

export async function deliverNotification(id, { prisma, config = env, clock = () => new Date(), send = sendNotificationEmail } = {}) {
  const now = clock();
  const leaseToken = crypto.randomUUID();
  const claimed = await prisma.notificationDelivery.updateMany({
    where: { id, OR: [ { status: "PENDING", nextAttemptAt: { lte: now } }, { status: "PROCESSING", leaseUntil: { lte: now } } ] },
    data: { status: "PROCESSING", leaseToken, leaseUntil: new Date(now.getTime() + LEASE_MS) },
  });
  if (!claimed.count) return "skipped";
  const save = (data) => prisma.notificationDelivery.updateMany({ where: { id, status: "PROCESSING", leaseToken }, data });
  const finish = async (status, extra = {}) => {
    await save({ status, leaseUntil: null, leaseToken: null, ...extra });
    return status.toLowerCase();
  };
  const delivery = await prisma.notificationDelivery.findUnique({ where: { id } });
  if (!delivery || delivery.leaseToken !== leaseToken) return "skipped";
  const user = await prisma.user.findUnique({ where: { id: delivery.userId }, select: USER_SELECT });
  const preferences = publicPreferences(user?.notificationPreference);
  const interview = delivery.kind === "INTERVIEW_REMINDER";
  const resource = await (interview ? prisma.interview : prisma.task).findFirst({
    where: { id: delivery.resourceId, userId: delivery.userId },
    ...(interview ? { include: { application: { include: { company: true } } } } : {}),
  });
  const checkAt = clock();
  if (!user?.emailVerifiedAt || !preferences.emailEnabled || !resource ||
      new Date(interview ? resource.scheduledAt : resource.dueDate).getTime() !== delivery.eventAt.getTime() ||
      eligibleKind(resource, preferences, checkAt, interview) !== delivery.kind ||
      (delivery.payload && delivery.payload.to[0] !== user.email)) {
    return finish("CANCELED", { payload: Prisma.DbNull });
  }
  if (delivery.firstAttemptAt && checkAt.getTime() - delivery.firstAttemptAt.getTime() >= RETRY_WINDOW_MS) {
    return finish("UNKNOWN", { lastError: "Retry window expired; reconcile with provider before any manual resend.", payload: Prisma.DbNull });
  }
  const allowedAt = nextAllowedTime(checkAt, preferences);
  if (allowedAt > checkAt) return finish("PENDING", { nextAttemptAt: allowedAt });
  const payload = delivery.payload ?? buildNotificationEmail(delivery, user, resource, preferences, config);
  // Persist identical provider parameters BEFORE the network request. A crash can retry safely.
  const prepared = await save({ payload, firstAttemptAt: delivery.firstAttemptAt ?? checkAt, attempts: { increment: 1 } });
  if (!prepared.count) return "skipped";
  let providerId;
  try {
    providerId = await send(payload, `notification/${delivery.dedupeKey}`, { config });
  } catch (error) {
    const nextAttemptAt = new Date(clock().getTime() + Math.min(60, 2 ** Math.min(delivery.attempts, 6)) * 60000);
    const state = error.permanent ? "FAILED" : "PENDING";
    await finish(state, { nextAttemptAt, lastError: error.permanent ? "Provider rejected email permanently." : "Delivery attempt failed; retry scheduled.", ...(error.permanent ? { payload: Prisma.DbNull } : {}) });
    return error.permanent ? "failed" : "retrying";
  }
  // Keep acknowledgement failures outside the provider catch; the expired lease retries the same key.
  return finish("SENT", { providerId, sentAt: clock(), lastError: null, payload: Prisma.DbNull });
}

export async function runNotificationDelivery({ prisma, config = env, clock = () => new Date(), send = sendNotificationEmail } = {}) {
  if (config.NOTIFICATION_MODE && config.NOTIFICATION_MODE !== "legacy") return runDailyNotifications({ prisma, config, clock });
  function validOrigin(value) {
    try {
      const url = new URL(value);
      return (config.NODE_ENV === "production" ? url.protocol === "https:" : ["http:", "https:"].includes(url.protocol)) && !url.username && !url.password && !url.search && !url.hash;
    } catch { return false; }
  }
  if (!config.RESEND_API_KEY || !config.NOTIFICATION_UNSUBSCRIBE_SECRET || !validOrigin(config.APP_URL) || !validOrigin(config.API_PUBLIC_URL) ||
      (config.NODE_ENV === "production" && config.NOTIFICATION_UNSUBSCRIBE_SECRET.length < 32)) {
    throw Object.assign(new Error("Configure Resend, public APP_URL/API_PUBLIC_URL and a long NOTIFICATION_UNSUBSCRIBE_SECRET for reminder delivery (HTTPS required in production)."), { status: 503 });
  }
  prisma ??= await getPrismaAsync();
  if (prisma.notificationOperation && await prisma.notificationOperation.count({ where: { firstAttemptAt: { not: null }, status: { notIn: ["SENT", "CANCELED", "FAILED", "SKIPPED"] } } })) {
    throw Object.assign(new Error("Resolve scheduled notification operations in drain mode before enabling legacy delivery."), { status: 503 });
  }
  const started = Date.now();
  const queued = await enqueueNotifications(prisma, clock());
  const now = clock();
  const candidates = await prisma.notificationDelivery.findMany({
    where: { OR: [{ status: "PENDING", nextAttemptAt: { lte: now } }, { status: "PROCESSING", leaseUntil: { lte: now } }] },
    orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }], take: 50, select: { id: true },
  });
  const counts = { queued, sent: 0, canceled: 0, pending: 0, skipped: 0, retrying: 0, failed: 0, unknown: 0 };
  for (const { id } of candidates) {
    if (Date.now() - started > 45000) break;
    const result = await deliverNotification(id, { prisma, config, clock, send });
    counts[result]++;
  }
  return counts;
}
