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
  return res.status(delivery.failed || delivery.retrying || delivery.unknown ? 503 : 200).json({ delivery });
});

// No login required. GET is deliberately read-only to protect against email link scanners.
router.get("/unsubscribe", (_req, res) => {
  res.set("Cache-Control", "no-store");
  return res.status(200).json({ message: "Confirm unsubscribe using POST with the token from your reminder email." });
});
router.post("/unsubscribe", async (req, res) => {
  res.set("Cache-Control", "no-store");
  await unsubscribeNotifications(req.query.token ?? req.body?.token);
  return res.status(200).json({ message: "You have unsubscribed from all reminder emails. Account security emails will continue." });
});

router.get("/preferences", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  return res.json({ preferences: await getNotificationPreferences(req.auth.sub) });
});
router.patch("/preferences", requireAuth, async (req, res) => {
  return res.json({ preferences: await updateNotificationPreferences(req.auth.sub, req.body) });
});

export default router;
