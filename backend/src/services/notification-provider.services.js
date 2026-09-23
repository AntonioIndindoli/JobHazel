import { env } from "../config/env.js";

export function notificationProvider({ config = env, fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  async function request(path, method = "GET", payload, key) {
    if (!config.RESEND_API_KEY) throw Object.assign(new Error("Reminder provider is not configured."), { safeToRetry: true });
    const response = await fetchImpl(`https://api.resend.com/emails${path}`, {
      method, headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}), signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const retry = response.headers.get("retry-after");
      const seconds = Number(retry);
      const retryAfterMs = retry ? (Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry) - Date.now()) : 60000;
      throw Object.assign(new Error(`Reminder provider HTTP ${response.status}.`), {
        status: response.status, retryAfterMs: Math.max(1000, retryAfterMs || 60000),
        permanent: [400, 401, 403, 404, 422].includes(response.status),
        safeToRetry: response.status === 429,
      });
    }
    const data = await response.json();
    if (!data.id) throw new Error("Reminder provider returned no ID.");
    return data;
  }
  return {
    schedule: (payload, key) => request("", "POST", payload, key),
    retrieve: (id) => request(`/${encodeURIComponent(id)}`),
    cancel: (id) => request(`/${encodeURIComponent(id)}/cancel`, "POST"),
  };
}
