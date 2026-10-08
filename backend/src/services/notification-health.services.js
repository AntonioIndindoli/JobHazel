import { env } from "../config/env.js";
import { getPrismaAsync } from "../db/prisma.js";
import { dailySlot } from "./notification-digest.services.js";
import { productionConfigurationIssues, SCHEDULED_NOTIFICATION_MODE } from "../config/release-policy.js";

// Operator-only read model. Does not enqueue, send, retry, or cancel anything.
export async function notificationHealth({ prisma, config = env, now = new Date() } = {}) {
  prisma ??= await getPrismaAsync();
  const terminal = ["SENT", "CANCELED", "SKIPPED", "FAILED"];
  const due = { status: { notIn: terminal }, OR: [{ desired: false }, { nextAttemptAt: { lte: now } }] };
  const [lastCompleted, dueOperations, dirtyUsers, unknown, failed, eligibleUsers, oldest, lastWebhook, worker, oldestSync, throttle] = await Promise.all([
    prisma.notificationRun.findFirst({ where: { completedAt: { not: null } }, orderBy: { completedAt: "desc" }, select: { id: true, completedAt: true } }),
    prisma.notificationOperation.count({ where: due }),
    prisma.notificationSync.count(),
    prisma.notificationOperation.count({ where: { status: "UNKNOWN" } }),
    prisma.notificationOperation.count({ where: { desired: true, status: "FAILED" } }),
    prisma.user.count({ where: { emailVerifiedAt: { not: null }, notificationPreference: { is: { emailEnabled: true } } } }),
    prisma.notificationOperation.findFirst({ where: { ...due, status: { notIn: [...terminal, "SCHEDULED"] } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.notificationProviderEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.notificationWorkerState.findUnique({ where: { id: "reminders" } }),
    prisma.notificationSync.findFirst({ orderBy: { updatedAt: "asc" }, select: { updatedAt: true } }),
    prisma.providerRateLimit.findUnique({ where: { scope: config.RESEND_RATE_LIMIT_SCOPE ?? "jobhazel-resend" }, select: { blockedUntil: true } }),
  ]);
  const issues = productionConfigurationIssues(config, { requireScheduled: true });
  // One hour of grace after the once-daily cron, then require that day's run.
  const expectedRun = dailySlot(new Date(+now - 3600000)).id;
  const stale = !lastCompleted || lastCompleted.id < expectedRun;
  const limit = config.NOTIFICATION_COHORT_LIMIT ?? 5;
  const excludedUsers = limit ? Math.max(0, eligibleUsers - limit) : 0;
  const interval = config.NOTIFICATION_WORKER_INTERVAL_SECONDS ?? 86400;
  const workerStale = !worker?.lastFinishedAt || +now - +worker.lastFinishedAt > (interval * 2 + 60) * 1000;
  const oldestAt = Math.min(oldest ? +oldest.createdAt : Infinity, oldestSync ? +oldestSync.updatedAt : Infinity);
  const oldestPendingAgeSeconds = Number.isFinite(oldestAt) ? Math.max(0, Math.floor((+now - oldestAt) / 1000)) : 0;
  const alerts = [];
  const alert = (code, severity, message, action) => alerts.push({ code, severity, message, action });
  if (issues.length) alert("CONFIGURATION", "critical", "Reminder configuration is invalid.", "Correct configurationIssues before restarting the worker.");
  if (stale) alert("DAILY_RUN_MISSED", "critical", "The expected daily reminder run has not completed.", "Check scheduler authentication, worker logs and the daily discovery cursor; resume the delivery endpoint.");
  if (workerStale) alert("WORKER_MISSED", "critical", "Reminder worker heartbeat is missing or stale.", "Check the independent scheduler and CRON_SECRET; invoke /notifications/maintenance/deliver and verify lastFinishedAt advances.");
  if (unknown) alert("UNKNOWN_ACCEPTANCE", "critical", `${unknown} provider acceptances need reconciliation.`, "Reconcile operation IDs with provider logs and signed callbacks; do not blindly resend unknown messages.");
  if (failed) alert("DELIVERY_FAILED", "critical", `${failed} desired reminder operations failed.`, "Inspect provider outcomes, sender credentials and quotas; use explicit user retry only for confirmed creation rejection.");
  if (excludedUsers) alert("CAPACITY_EXCLUDED", "warning", `${excludedUsers} opted-in users are outside the rollout cohort.`, "Validate worker throughput and provider quota, then increase NOTIFICATION_COHORT_LIMIT (0 enrolls all eligible users).");
  if ((dueOperations || dirtyUsers) && oldestPendingAgeSeconds >= (config.NOTIFICATION_BACKLOG_ALERT_SECONDS ?? 900)) alert("BACKLOG_AGED", "critical", "Reminder work exceeds the allowed backlog age.", "Check provider cooldown and worker throughput; increase worker frequency or reduce enrollment until the backlog drains.");
  if (throttle?.blockedUntil && +throttle.blockedUntil > +now) alert("PROVIDER_COOLDOWN", "warning", "The provider account is in a shared cooldown.", "Respect blockedUntil; inspect Resend rate limits and daily/monthly quotas before changing throughput.");
  return {
    ok: !alerts.length && !dueOperations && !dirtyUsers,
    alerts,
    mode: config.NOTIFICATION_MODE,
    configurationIssues: issues,
    scheduler: { expectedRun, stale, lastCompleted, workerStale, intervalSeconds: interval, lastStartedAt: worker?.lastStartedAt ?? null, lastFinishedAt: worker?.lastFinishedAt ?? null },
    capacity: { limit, eligibleUsers, excludedUsers },
    dueOperations, dirtyUsers, unknown, failed,
    oldestPendingAgeSeconds,
    providerBlockedUntil: throttle?.blockedUntil ?? null,
    lastWebhookAt: lastWebhook?.createdAt ?? null,
    scheduledMode: config.NOTIFICATION_MODE === SCHEDULED_NOTIFICATION_MODE,
  };
}
