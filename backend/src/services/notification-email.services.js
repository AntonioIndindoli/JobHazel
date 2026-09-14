import { env } from "../config/env.js";
import { unsubscribeToken } from "./notification-policy.js";

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);

export function buildNotificationEmail(delivery, user, resource, preferences, config = env) {
  const interview = delivery.kind === "INTERVIEW_REMINDER";
  const heading = interview ? "Your interview is coming up" : delivery.kind === "OVERDUE_TASK" ? "You have an overdue task" : "Your task is coming up";
  const title = interview ? `${resource.application.title}${resource.application.company?.name ? ` at ${resource.application.company.name}` : ""}` : resource.title;
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: preferences.timeZone, dateStyle: "full", ...(interview ? { timeStyle: "short" } : {}),
  }).format(new Date(delivery.eventAt));
  const token = encodeURIComponent(unsubscribeToken(user, config.NOTIFICATION_UNSUBSCRIBE_SECRET));
  const unsubscribeUrl = `${config.APP_URL}/unsubscribe?token=${token}`;
  const oneClickUrl = `${config.API_PUBLIC_URL}/notifications/unsubscribe?token=${token}`;
  const copy = `${title} — ${interview ? "Scheduled for" : "Due"} ${when} (${preferences.timeZone}).`;
  return {
    from: config.EMAIL_FROM, to: [user.email], subject: `${heading}: ${title}`.replace(/[\r\n]/g, " "),
    text: `${heading}\n\n${copy}\n\nOpen JobHazel: ${config.APP_URL}\nManage preferences in Settings.\nUnsubscribe from reminder emails: ${unsubscribeUrl}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#183323"><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(copy)}</p><p><a href="${escapeHtml(config.APP_URL)}">Open JobHazel</a></p><p>Manage your notification preferences in Settings.</p><p><a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe from all reminder emails</a></p></div>`,
    headers: { "List-Unsubscribe": `<${oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

export async function sendNotificationEmail(payload, idempotencyKey, { config = env, fetchImpl = fetch } = {}) {
  if (!config.RESEND_API_KEY) throw new Error("Reminder email delivery is not configured.");
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    // Do not persist provider response bodies containing recipient/content details.
    throw Object.assign(new Error(`Email provider returned HTTP ${response.status}.`), {
      permanent: response.status >= 400 && response.status < 500 && ![408, 409, 429].includes(response.status),
    });
  }
  const result = await response.json();
  if (typeof result.id !== "string" || !result.id) throw new Error("Email provider returned no delivery ID.");
  return result.id;
}
