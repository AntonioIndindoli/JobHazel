import { env } from "../config/env.js";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
}

export async function sendAccountEmail({ to, subject, heading, copy, actionLabel, actionUrl }) {
  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === "production") throw new Error("Email delivery is not configured.");
    console.info(`[auth-email] ${subject}: ${actionUrl}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#183323"><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(copy)}</p><p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 18px;border-radius:9px;background:#238b45;color:white;text-decoration:none;font-weight:700">${escapeHtml(actionLabel)}</a></p><p style="font-size:12px;color:#637369">If you did not request this, you can ignore this email.</p></div>`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Email delivery failed (${response.status}): ${detail.slice(0, 300)}`);
  }
}
