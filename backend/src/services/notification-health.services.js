import { env } from "../config/env.js";
import { getPrismaAsync } from "../db/prisma.js";
import { dailySlot } from "./notification-digest.services.js";
import { productionConfigurationIssues, SCHEDULED_NOTIFICATION_MODE } from "../config/release-policy.js";

// Operator-only read model. Does not enqueue, send, retry, or cancel anything.
export async function notificationHealth({ prisma, config = env, now = new Date() } = {}) {
  prisma ??= await getPrismaAsync();
  const terminal = ["SENT", "CANCELED", "SKIPPED", "FAILED"];
  const due = { status: { notIn: terminal }, OR: [{ desired: false }, { providerId: null, nextAttemptAt: { lte: now } }] };
  const [lastCompleted, dueOperations, dirtyUsers, unknown, failed, eligibleUsers, oldest, lastWebhook] = await Promise.all([
    prisma.notificationRun.findFirst({ where: { completedAt: { not: null } }, orderBy: { completedAt: "desc" }, select: { id: true, completedAt: true } }),
    prisma.notificationOperation.count({ where: due }),
    prisma.notificationSync.count(),
    prisma.notificationOperation.count({ where: { status: "UNKNOWN" } }),
    prisma.notificationOperation.count({ where: { desired: true, status: "FAILED" } }),
    prisma.user.count({ where: { emailVerifiedAt: { not: null }, notificationPreference: { is: { emailEnabled: true } } } }),
    prisma.notificationOperation.findFirst({ where: due, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.notificationProviderEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const issues = productionConfigurationIssues(config, { requireScheduled: true });
  // One hour of grace after the once-daily cron, then require that day's run.
  const expectedRun = dailySlot(new Date(+now - 3600000)).id;
  const stale = !lastCompleted || lastCompleted.id < expectedRun;
  const excludedUsers = Math.max(0, eligibleUsers - config.NOTIFICATION_COHORT_LIMIT);
  return {
    ok: !issues.length && !stale && !unknown && !failed && !excludedUsers && !dueOperations && !dirtyUsers,
    mode: config.NOTIFICATION_MODE,
    configurationIssues: issues,
    scheduler: { expectedRun, stale, lastCompleted },
    capacity: { limit: config.NOTIFICATION_COHORT_LIMIT, eligibleUsers, excludedUsers },
    dueOperations, dirtyUsers, unknown, failed,
    oldestPendingAgeSeconds: oldest ? Math.max(0, Math.floor((+now - +oldest.createdAt) / 1000)) : 0,
    lastWebhookAt: lastWebhook?.createdAt ?? null,
    scheduledMode: config.NOTIFICATION_MODE === SCHEDULED_NOTIFICATION_MODE,
  };
}
