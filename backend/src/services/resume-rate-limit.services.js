import { getPrismaAsync } from "../db/prisma.js";

async function lockUser(tx, userId) {
  if (typeof tx.$queryRaw === "function") {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  }
}

export async function consumeResumeRateLimit(
  userId,
  endpoint,
  { limit, windowSeconds, now = new Date() },
  prismaOverride,
) {
  const prisma = prismaOverride ?? (await getPrismaAsync());

  // Lightweight test adapters used by unrelated API tests intentionally omit
  // the persistence model. Production Prisma clients always expose it.
  if (!prisma.resumeEndpointRateLimit) {
    return {
      allowed: true,
      limit,
      remaining: limit - 1,
      resetAt: new Date(now.getTime() + windowSeconds * 1000),
    };
  }

  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const key = { userId_endpoint: { userId, endpoint } };
    const current = await tx.resumeEndpointRateLimit.findUnique({ where: key });
    const windowMilliseconds = windowSeconds * 1000;
    const windowExpired =
      !current || now.getTime() - current.windowStartedAt.getTime() >= windowMilliseconds;

    if (windowExpired) {
      await tx.resumeEndpointRateLimit.upsert({
        where: key,
        create: { userId, endpoint, windowStartedAt: now, requestCount: 1 },
        update: { windowStartedAt: now, requestCount: 1 },
      });
      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - 1),
        resetAt: new Date(now.getTime() + windowMilliseconds),
      };
    }

    const resetAt = new Date(current.windowStartedAt.getTime() + windowMilliseconds);
    if (current.requestCount >= limit) {
      return { allowed: false, limit, remaining: 0, resetAt };
    }

    const updated = await tx.resumeEndpointRateLimit.update({
      where: key,
      data: { requestCount: { increment: 1 } },
    });
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - updated.requestCount),
      resetAt,
    };
  });
}
