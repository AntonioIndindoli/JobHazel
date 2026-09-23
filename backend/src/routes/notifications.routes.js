import { flushUserNotifications, notificationStatus } from "../services/notification-operations.services.js";
import { getPrismaAsync } from "../db/prisma.js";
import { consumeResumeRateLimit } from "../services/resume-rate-limit.services.js";
import crypto from "node:crypto";
import { Router } from "express";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { getNotificationPreferences, runNotificationDelivery, unsubscribeNotifications, updateNotificationPreferences } from "../services/notifications.services.js";

const router = Router();

export function requireNotificationCronAuth(req, res, next) {
  if (!env.CRON_SECRET) return res.status(503).json({ message: "Notification scheduling is not configured." });
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const actual = Buffer.from(req.headers.authorization ?? "");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return res.status(401).json({ message: "Invalid scheduler credentials." });
  }
  return next();
}

router.get("/maintenance/deliver", requireNotificationCronAuth, async (_req, res) => {
  res.set("Cache-Control", "no-store");
  const delivery = await runNotificationDelivery();
  return res.status(delivery.incomplete || delivery.failed || delivery.retrying || delivery.unknown ? 503 : 200).json({ delivery });
});

// No login required. GET is deliberately read-only to protect against email link scanners.
router.get("/unsubscribe", (_req, res) => {
  res.set("Cache-Control", "no-store");
  return res.status(200).json({ message: "Confirm unsubscribe using POST with the token from your reminder email." });
});
router.post("/unsubscribe", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const userId = await unsubscribeNotifications(req.query.token ?? req.body?.token);
  const notification = await flushUserNotifications(userId);
  return res.status(200).json({ notification, message: notification.needsAttention ? "Reminder emails are disabled. Cancellation is pending; an already-scheduled email may still arrive." : "You have unsubscribed from all reminder emails. Account security emails will continue." });
});

router.get("/preferences", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const preferences = await getNotificationPreferences(req.auth.sub);
  const notification = env.NOTIFICATION_MODE === "legacy" ? { mode: "legacy", needsAttention: false } : await notificationStatus(await getPrismaAsync(), req.auth.sub);
  return res.json({ preferences, notification });
});
router.patch("/preferences", requireAuth, async (req, res) => {
  const preferences = await updateNotificationPreferences(req.auth.sub, req.body);
  const notification = await flushUserNotifications(req.auth.sub);
  return res.json({ preferences, notification });
});

router.get("/status", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (env.NOTIFICATION_MODE === "legacy") return res.json({ notification: { mode: "legacy", needsAttention: false } });
  return res.json({ notification: await notificationStatus(await getPrismaAsync(), req.auth.sub) });
});
router.post("/retry", requireAuth, async (req, res) => {
  const limit = await consumeResumeRateLimit(req.auth.sub, "notification-retry", { limit: 5, windowSeconds: 900 });
  if (!limit.allowed) {
    res.set("Retry-After", String(Math.max(1, Math.ceil((+limit.resetAt - Date.now()) / 1000))));
    return res.status(429).json({ message: "Please wait before retrying reminder scheduling." });
  }
  if (env.NOTIFICATION_MODE === "daily-digest-scheduled-interviews") {
    const prisma = await getPrismaAsync();
    // Only explicit, confirmed provider rejection permits a fresh creation.
    // UNKNOWN and provider-delivery failures are never reset by this action.
    await prisma.notificationOperation.updateMany({ where: { userId: req.auth.sub, kind: "INTERVIEW_REMINDER", status: "FAILED", providerId: null, lastError: "Provider rejected reminder." }, data: { desired: false } });
  }
  return res.json({ notification: await flushUserNotifications(req.auth.sub) });
});
export default router;
