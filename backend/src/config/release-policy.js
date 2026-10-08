export const SCHEDULED_NOTIFICATION_MODE = "daily-digest-scheduled-interviews";

function publicOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      url.pathname === "/" && !url.search && !url.hash &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch { return false; }
}

// Return setting names and actionable messages only, never configuration values.
export function productionConfigurationIssues(config, { requireScheduled = false } = {}) {
  const issues = [];
  if (!config.NEON_AUTH_BASE_URL) issues.push("NEON_AUTH_BASE_URL is required.");
  if (!config.AUTH_RATE_LIMIT_SECRET || config.AUTH_RATE_LIMIT_SECRET.length < 32) issues.push("AUTH_RATE_LIMIT_SECRET must contain at least 32 characters.");
  if (!config.COOKIE_SECURE) issues.push("COOKIE_SECURE must be true.");
  if (!publicOrigin(config.APP_URL)) issues.push("APP_URL must be a public HTTPS origin.");
  if (!publicOrigin(config.API_PUBLIC_URL)) issues.push("API_PUBLIC_URL must be a public HTTPS origin.");
  const origins = (config.CORS_ORIGIN ?? "").split(",").map((value) => value.trim());
  if (!origins.length || origins.some((value) => !publicOrigin(value)) || !origins.includes(config.APP_URL)) issues.push("CORS_ORIGIN must contain public HTTPS origins including APP_URL.");
  if (!config.CRON_SECRET || config.CRON_SECRET.length < 32) issues.push("CRON_SECRET must contain at least 32 characters.");
  if (config.RESUME_CLEANUP_SECRET !== config.CRON_SECRET) issues.push("RESUME_CLEANUP_SECRET must match CRON_SECRET for the checked-in Vercel cron.");
  if (!config.NOTIFICATION_MODE) issues.push("Set NOTIFICATION_MODE explicitly before production deployment.");
  if (requireScheduled && config.NOTIFICATION_MODE !== SCHEDULED_NOTIFICATION_MODE) issues.push("Release requires NOTIFICATION_MODE=daily-digest-scheduled-interviews.");
  if (config.NOTIFICATION_MODE === SCHEDULED_NOTIFICATION_MODE) {
    if (!config.RESEND_API_KEY) issues.push("RESEND_API_KEY is required for scheduled reminders.");
    if (!config.RESEND_WEBHOOK_SECRET?.startsWith("whsec_")) issues.push("RESEND_WEBHOOK_SECRET must be configured for signed delivery callbacks.");
    if (!config.NOTIFICATION_UNSUBSCRIBE_SECRET || config.NOTIFICATION_UNSUBSCRIBE_SECRET.length < 32) issues.push("NOTIFICATION_UNSUBSCRIBE_SECRET must contain at least 32 characters.");
    if (!config.EMAIL_FROM || /@resend\.dev\b/i.test(config.EMAIL_FROM)) issues.push("EMAIL_FROM must use your verified sender domain.");
    if (config.NOTIFICATION_RUN_BUDGET_MS > 45000) issues.push("NOTIFICATION_RUN_BUDGET_MS must not exceed 45000 with the checked-in 60-second function limit.");
    if ((config.NOTIFICATION_COHORT_LIMIT === 0 || config.NOTIFICATION_COHORT_LIMIT > 5) && (config.NOTIFICATION_WORKER_INTERVAL_SECONDS ?? 86400) > 300) issues.push("Expanded reminder enrollment requires NOTIFICATION_WORKER_INTERVAL_SECONDS<=300 and a matching recurring worker scheduler.");
  }
  if (config.NOTIFICATION_MODE === "drain" && !config.RESEND_API_KEY) issues.push("RESEND_API_KEY is required to drain scheduled reminders.");
  return issues;
}
