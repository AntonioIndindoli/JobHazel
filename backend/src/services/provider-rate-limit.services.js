import { env } from "../config/env.js";
import { getPrismaAsync } from "../db/prisma.js";

export function providerRetryAfter(response, now = Date.now()) {
  const value = response.headers?.get?.("retry-after");
  const seconds = value && Number(value);
  const delay = value ? (Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now) : 60000;
  return Math.max(1000, Number.isFinite(delay) ? delay : 60000);
}

// One scope per Resend team, shared by every app API key and server instance.
// The database clock and conditional UPDATE prevent overlapping reservations.
export async function acquireProviderSlot({ prisma, config = env } = {}) {
  prisma ??= await getPrismaAsync();
  const scope = config.RESEND_RATE_LIMIT_SCOPE ?? "jobhazel-resend";
  const interval = config.NOTIFICATION_PROVIDER_INTERVAL_MS ?? 200;
  await prisma.$executeRaw`INSERT INTO "ProviderRateLimit" ("scope") VALUES (${scope}) ON CONFLICT ("scope") DO NOTHING`;
  const rows = await prisma.$queryRaw`
    UPDATE "ProviderRateLimit"
    SET "nextAllowedAt" = clock_timestamp() + ${interval} * interval '1 millisecond', "updatedAt" = clock_timestamp()
    WHERE "scope" = ${scope} AND "nextAllowedAt" <= clock_timestamp() AND "blockedUntil" <= clock_timestamp()
    RETURNING "scope"`;
  if (rows.length) return;
  const [state] = await prisma.$queryRaw`
    SELECT GREATEST(0, EXTRACT(EPOCH FROM (GREATEST("nextAllowedAt", "blockedUntil") - clock_timestamp())) * 1000) AS "waitMs"
    FROM "ProviderRateLimit" WHERE "scope" = ${scope}`;
  throw Object.assign(new Error("Provider account throttle is busy."), {
    safeToRetry: true, retryAfterMs: Math.max(1, Math.ceil(Number(state?.waitMs ?? interval))), throttled: true,
  });
}

export async function blockProvider(response, { prisma, config = env } = {}) {
  prisma ??= await getPrismaAsync();
  const scope = config.RESEND_RATE_LIMIT_SCOPE ?? "jobhazel-resend";
  const delay = providerRetryAfter(response);
  await prisma.$executeRaw`
    UPDATE "ProviderRateLimit" SET "blockedUntil" = GREATEST("blockedUntil", clock_timestamp() + ${delay} * interval '1 millisecond'),
      "updatedAt" = clock_timestamp() WHERE "scope" = ${scope}`;
}

export async function rateLimitedProviderFetch(url, init, {
  config = env, fetchImpl = fetch, prisma, acquire = acquireProviderSlot, block = blockProvider,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), maxWaitMs = 1000,
} = {}) {
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    try { await acquire({ prisma, config }); break; }
    catch (error) {
      if (!error.throttled || Date.now() + error.retryAfterMs > deadline) {
        error.safeToRetry = true; // No provider request has started.
        throw error;
      }
      await sleep(error.retryAfterMs);
    }
  }
  // Start the network timeout after acquiring a slot, not while waiting for one.
  const { timeoutMs = 5000, ...request } = init;
  const response = await fetchImpl(url, { ...request, signal: AbortSignal.timeout(timeoutMs) });
  if (response.status === 429) {
    try { await block(response, { prisma, config }); }
    catch { throw Object.assign(new Error("Provider cooldown could not be persisted."), { safeToRetry: true, retryAfterMs: providerRetryAfter(response) }); }
  }
  return response;
}
