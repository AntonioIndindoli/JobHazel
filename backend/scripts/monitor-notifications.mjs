// Run independently of the delivery cron so a missing cron still raises an alert.
// Only aggregate codes/actions are forwarded; never recipient data or credentials.
import { pathToFileURL } from "node:url";

export async function checkNotifications({ origin, secret, fetchImpl = fetch }) {
  try {
    const response = await fetchImpl(`${origin}/notifications/maintenance/status`, {
      headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(15000), redirect: "error",
    });
    const body = await response.json();
    if (![200, 503].includes(response.status) || !body.status || !Array.isArray(body.status.alerts)) throw Error("Invalid monitor response.");
    return body.status.alerts;
  } catch {
    return [{ code: "MONITOR_UNAVAILABLE", severity: "critical", message: "Reminder health endpoint is unavailable.", action: "Check API readiness, database migration, network connectivity and monitor bearer credentials." }];
  }
}

export async function runMonitor({ origin, secret, webhook, fetchImpl = fetch, log = console.error } = {}) {
  const alerts = await checkNotifications({ origin, secret, fetchImpl });
  if (!alerts.length) return 0;
  const report = { service: "jobhazel-reminders", alerts, observedAt: new Date().toISOString() };
  log(JSON.stringify(report));
  if (webhook) {
    try {
      const url = new URL(webhook);
      if (url.protocol !== "https:" || url.username || url.password) throw Error("Invalid webhook.");
      const response = await fetchImpl(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(report), signal: AbortSignal.timeout(10000), redirect: "error" });
      if (!response.ok) throw Error("Webhook rejected report.");
    } catch { log(JSON.stringify({ service: "jobhazel-reminders", code: "ALERT_DELIVERY_FAILED", action: "Check the independent alert webhook; the monitor still exits nonzero." })); }
  }
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const origin = process.env.API_PUBLIC_URL;
  const secret = process.env.CRON_SECRET;
  if (!origin || !secret || !/^https:\/\//.test(origin)) throw Error("Set HTTPS API_PUBLIC_URL and CRON_SECRET in the independent monitor environment.");
  process.exitCode = await runMonitor({ origin: origin.replace(/\/$/, ""), secret, webhook: process.env.NOTIFICATION_ALERT_WEBHOOK_URL });
}
