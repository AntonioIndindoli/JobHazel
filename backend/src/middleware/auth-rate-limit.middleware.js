import crypto from "node:crypto";
import { getPrismaAsync } from "../db/prisma.js";
import { env } from "../config/env.js";

export const AUTH_RATE_LIMITS = Object.freeze({
  login: { ip: 50, email: 10 },
  signup: { ip: 20, email: 5 },
  "forgot-password": { ip: 20, email: 3 },
  "resend-verification": { ip: 20, email: 3 },
  "verify-email": { ip: 50, email: 10 },
  "reset-password": { ip: 50, email: 10 },
});
export const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;

export async function consumeAuthRateLimit(action, dimension, value, { prisma, now = new Date() } = {}) {
  prisma ??= await getPrismaAsync();
  const limit = AUTH_RATE_LIMITS[action][dimension];
  const digest = crypto.createHmac("sha256", env.AUTH_RATE_LIMIT_SECRET).update(value).digest("hex");
  const key = `${action}:${dimension}:${digest}`;
  const expiresAt = new Date(now.getTime() + AUTH_RATE_WINDOW_MS);
  // One atomic statement shares quotas across processes and concurrent requests.
  const [row] = await prisma.$queryRaw`
    INSERT INTO "AuthRateLimit" ("key", "count", "expiresAt") VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "AuthRateLimit"."expiresAt" <= ${now} THEN 1
        ELSE LEAST("AuthRateLimit"."count" + 1, ${limit + 1}) END,
      "expiresAt" = CASE WHEN "AuthRateLimit"."expiresAt" <= ${now} THEN ${expiresAt}
        ELSE "AuthRateLimit"."expiresAt" END
    RETURNING "count", "expiresAt"`;
  return { allowed: row.count <= limit, retryAfter: Math.max(1, Math.ceil((row.expiresAt - now) / 1000)) };
}

export function rateLimitAuth(action, consume = consumeAuthRateLimit) {
  return async (req, res, next) => {
    // req.ip uses the socket unless the deployment explicitly trusts its proxy.
    const ip = await consume(action, "ip", req.ip ?? req.socket.remoteAddress ?? "unknown");
    if (!ip.allowed) return reject(res, ip);
    if (typeof req.body?.email === "string") {
      const email = await consume(action, "email", req.body.email.trim().toLowerCase());
      if (!email.allowed) return reject(res, email);
    }
    return next();
  };
}

function reject(res, result) {
  res.setHeader("Retry-After", String(result.retryAfter));
  return res.status(429).json({ code: "AUTH_RATE_LIMITED", message: "Too many attempts. Please try again later." });
}
