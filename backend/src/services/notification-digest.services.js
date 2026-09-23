import crypto from "node:crypto";
import { localDay, nextAllowedTime, publicPreferences } from "./notification-policy.js";
import { buildNotificationEmail } from "./notification-email.services.js";

export const DAY_MS = 86400000;
export const hashNotification = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function localDayBoundary(day, timeZone) {
  let low = day * DAY_MS - 2 * DAY_MS;
  let high = day * DAY_MS + 2 * DAY_MS;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (localDay(new Date(middle), timeZone) < day) low = middle + 1;
    else high = middle;
  }
  return new Date(low);
}
export function dailySlot(now) {
  const start = new Date(now);
  start.setUTCHours(15, 7, 0, 0);
  if (start > now) start.setUTCDate(start.getUTCDate() - 1);
  return { id: start.toISOString().slice(0, 10), start, end: new Date(+start + DAY_MS) };
}

export function interviewIntent(user, interview, now, config) {
  const p = publicPreferences(user.notificationPreference);
  if (!user.emailVerifiedAt || !p.emailEnabled || !p.interviewReminders || interview.outcome !== "SCHEDULED" || +interview.scheduledAt <= +now) return null;
  const nominal = new Date(+interview.scheduledAt - p.interviewReminderMinutes * 60000);
  const sendAt = nextAllowedTime(new Date(Math.max(+nominal, +now)), p);
  if (sendAt >= interview.scheduledAt) return null;
  const payload = buildNotificationEmail({ kind: "INTERVIEW_REMINDER", eventAt: interview.scheduledAt }, user, interview, p, config);
  // Identity deliberately excludes the moving clock for late reminders.
  const revision = hashNotification([payload, nominal, p.timeZone, p.quietHoursEnabled, p.quietHoursStart, p.quietHoursEnd]);
  return { revision, payload, sendAt, expiresAt: interview.scheduledAt, eventAt: interview.scheduledAt };
}

export function digestSections(tasks, p, now) {
  const sections = { today: [], overdue: [], upcoming: [] };
  for (const task of tasks) {
    if (task.completedAt || !task.dueDate) continue;
    const days = localDay(new Date(task.dueDate), p.timeZone) - localDay(now, p.timeZone);
    if (days < 0 && p.overdueTasks) sections.overdue.push(task);
    if (days === 0 && p.upcomingTasks) sections.today.push(task);
    if (days > 0 && days <= p.taskReminderDays && p.upcomingTasks) sections.upcoming.push(task);
  }
  for (const tasks of Object.values(sections)) tasks.sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate) || a.id.localeCompare(b.id));
  return sections;
}

const escape = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
export function buildDigest(user, sections, now, config, totals = Object.fromEntries(Object.entries(sections).map(([key, tasks]) => [key, tasks.length]))) {
  const p = publicPreferences(user.notificationPreference);
  const format = new Intl.DateTimeFormat("en-US", { timeZone: p.timeZone, dateStyle: "medium" });
  const stamp = new Intl.DateTimeFormat("en-US", { timeZone: p.timeZone, dateStyle: "medium", timeStyle: "short" }).format(now);
  let remaining = 20;
  const lines = [`Task snapshot as of ${stamp} (${p.timeZone}). Tasks may have changed since this snapshot.`];
  for (const [key, label] of [["today", "Due today"], ["overdue", "Overdue"], ["upcoming", "Upcoming"]]) {
    const section = sections[key];
    lines.push(`\n${label} (${totals[key]})`);
    for (const task of section.slice(0, remaining)) lines.push(`${task.title} — ${format.format(new Date(task.dueDate))}`);
    remaining = Math.max(0, remaining - section.length);
  }
  // Reuse verified unsubscribe links/headers, then replace the single-task body.
  const base = buildNotificationEmail({ kind: "UPCOMING_TASK", eventAt: now }, user, { title: "Daily task summary" }, p, config);
  const footer = base.text.slice(base.text.indexOf("Open JobHazel:"));
  return { ...base, subject: "Your JobHazel daily task summary", text: `${lines.join("\n")}\n\n${footer}`,
    html: `<div><h1>Your daily task summary</h1><div style="white-space:pre-wrap">${escape(lines.join("\n"))}</div><p><a href="${escape(config.APP_URL)}">View all tasks in JobHazel</a></p>${base.html.slice(base.html.indexOf("<p>Manage"))}` };
}
