import { Webhook } from "svix";
import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { getPrismaAsync } from "../db/prisma.js";
import { applyProviderOutcome } from "./notification-operations.services.js";

const EVENTS = new Set(["scheduled", "sent", "delivered", "bounced", "failed", "suppressed", "complained", "delivery_delayed", "opened", "clicked"]);
export async function handleNotificationWebhook(raw, headers, { prisma, config = env } = {}) {
  if (!config.RESEND_WEBHOOK_SECRET) throw Object.assign(new Error("Webhook verification is not configured."), { status: 503 });
  let event;
  try { new Webhook(config.RESEND_WEBHOOK_SECRET).verify(raw, headers); event = JSON.parse(raw); }
  catch { throw Object.assign(new Error("Invalid webhook signature."), { status: 400 }); }
  const type = event.type?.replace(/^email\./, "");
  const providerId = event.data?.email_id;
  const eventAt = new Date(event.created_at);
  if (!EVENTS.has(type)) return;
  if (typeof providerId !== "string" || providerId.length > 200 || !Number.isFinite(+eventAt)) throw Object.assign(new Error("Invalid webhook event."), { status: 400 });
  prisma ??= await getPrismaAsync();
  await prisma.$transaction(async (tx) => {
    const id = headers["svix-id"];
    await tx.notificationProviderEvent.createMany({ data: [{ id, providerId, type, eventAt }], skipDuplicates: true });
    // Verified opaque tags recover receipts lost between provider acceptance and
    // the database write. Never retain the webhook's recipient or message body.
    const tags = event.data?.tags;
    const operationId = Array.isArray(tags) ? tags.find((tag) => tag.name === "notification")?.value : tags?.notification;
    if (typeof operationId === "string") {
      await tx.notificationOperation.updateMany({ where: { id: operationId, providerId: null }, data: { providerId, payload: Prisma.DbNull } });
    }
    const operation = await tx.notificationOperation.findUnique({ where: { providerId } });
    if (!operation) return; // Raw-free unmatched receipt is replayed on acknowledgement.
    await applyProviderOutcome(tx, operation.id, type, eventAt);
    if (!operation.desired || !operation.userId) {
      await tx.notificationOperation.updateMany({ where: { id: operation.id, status: { in: ["PENDING", "PROCESSING", "SCHEDULED", "UNKNOWN"] } }, data: { status: "CANCEL_PENDING", nextAttemptAt: new Date() } });
    }
  });
}
