import crypto from "node:crypto";

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  emailEnabled: false, upcomingTasks: true, overdueTasks: true, interviewReminders: true,
  taskReminderDays: 1, interviewReminderMinutes: 60, timeZone: "UTC",
  quietHoursEnabled: false, quietHoursStart: "22:00", quietHoursEnd: "08:00",
});

export function publicPreferences(value) {
  return Object.fromEntries(Object.entries(DEFAULT_NOTIFICATION_PREFERENCES).map(([key, fallback]) => [key, value?.[key] ?? fallback]));
}

export function validateNotificationPreferences(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) || !Object.keys(body).length) {
    throw Object.assign(new Error("Provide at least one notification preference."), { status: 400 });
  }
  const data = {};
  for (const [key, value] of Object.entries(body)) {
    let valid = Object.hasOwn(DEFAULT_NOTIFICATION_PREFERENCES, key);
    if (typeof DEFAULT_NOTIFICATION_PREFERENCES[key] === "boolean") valid &&= typeof value === "boolean";
    else if (key === "taskReminderDays") valid &&= Number.isInteger(value) && value >= 0 && value <= 7;
    else if (key === "interviewReminderMinutes") valid &&= Number.isInteger(value) && value >= 5 && value <= 10080;
    else if (key === "timeZone") {
      valid &&= typeof value === "string" && value.length <= 100;
      try { new Intl.DateTimeFormat("en", { timeZone: value }); } catch { valid = false; }
    } else valid &&= typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!valid) throw Object.assign(new Error(`Invalid notification preference: ${key}.`), { status: 400 });
    data[key] = value;
  }
  return data;
}

function localParts(date, timeZone) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map(({ type, value }) => [type, value]));
}

export function localDay(date, timeZone) {
  const { year, month, day } = localParts(date, timeZone);
  return Date.UTC(Number(year), Number(month) - 1, Number(day)) / 86400000;
}

export function isQuietTime(now, preferences) {
  if (!preferences.quietHoursEnabled) return false;
  const { hour, minute } = localParts(now, preferences.timeZone);
  const time = `${hour}:${minute}`;
  const { quietHoursStart: start, quietHoursEnd: end } = preferences;
  // Equal endpoints mean quiet all day; the API rejects this when enabled.
  return start < end ? time >= start && time < end : time >= start || time < end;
}

export function nextAllowedTime(now, preferences) {
  if (!isQuietTime(now, preferences)) return now;
  // Walk real instants so skipped/repeated local times during DST are handled correctly.
  const minute = Math.floor(now.getTime() / 60000) * 60000;
  for (let i = 1; i <= 48 * 60; i++) {
    const candidate = new Date(minute + i * 60000);
    if (!isQuietTime(candidate, preferences)) return candidate;
  }
  return new Date(now.getTime() + 86400000);
}

export function eligibleKind(resource, preferences, now, interview = false) {
  if (interview) {
    const remaining = new Date(resource.scheduledAt).getTime() - now.getTime();
    return preferences.interviewReminders && resource.outcome === "SCHEDULED" && remaining > 0 &&
      remaining <= preferences.interviewReminderMinutes * 60000 ? "INTERVIEW_REMINDER" : null;
  }
  if (resource.completedAt || !resource.dueDate) return null;
  const days = localDay(new Date(resource.dueDate), preferences.timeZone) - localDay(now, preferences.timeZone);
  if (days < 0) return preferences.overdueTasks ? "OVERDUE_TASK" : null;
  return preferences.upcomingTasks && days <= preferences.taskReminderDays ? "UPCOMING_TASK" : null;
}

export function notificationKey(userId, kind, resourceId, eventAt) {
  return crypto.createHash("sha256").update(JSON.stringify([userId, kind, resourceId, new Date(eventAt).toISOString()])).digest("hex");
}

export function unsubscribeToken(user, secret) {
  const payload = Buffer.from(JSON.stringify({ purpose: "notification-unsubscribe", userId: user.id, email: user.email })).toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function verifyUnsubscribeToken(token, secret) {
  const invalid = () => Object.assign(new Error("This unsubscribe link is invalid. Use notification settings or a newer reminder email."), { status: 400 });
  if (!secret) throw Object.assign(new Error("Unsubscribe is not configured."), { status: 503 });
  if (typeof token !== "string" || token.length > 2048) throw invalid();
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || !/^[A-Za-z0-9_-]{43}$/.test(signature) || extra !== undefined) throw invalid();
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw invalid();
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.purpose !== "notification-unsubscribe" || typeof data.userId !== "string" || typeof data.email !== "string") throw invalid();
    return data;
  } catch { throw invalid(); }
}
