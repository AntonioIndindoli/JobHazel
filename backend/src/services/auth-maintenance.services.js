import { getPrismaAsync } from "../db/prisma.js";

export async function cleanupAuthTokens({ prisma, now = new Date() } = {}) {
  prisma ??= await getPrismaAsync();
  const [auth, refresh, limits] = await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { OR: [{ expiresAt: { lte: now } }, { usedAt: { not: null } }, { email: null }] } }),
    prisma.refreshToken.deleteMany({ where: { OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }] } }),
    prisma.authRateLimit.deleteMany({ where: { expiresAt: { lte: now } } }),
  ]);
  return { authTokens: auth.count, refreshTokens: refresh.count, rateLimits: limits.count };
}
