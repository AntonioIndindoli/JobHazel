import { env } from "../../config/env.js";

export const accessToken = (userId) => `test-${userId}`;

// Domain API tests exercise ownership through the real auth middleware while
// replacing only the remote Neon service and its local identity lookup.
export function mockManagedAuth(prisma) {
  const originalFetch = globalThis.fetch;
  const originalUrl = env.NEON_AUTH_BASE_URL;
  const originalUser = prisma.user;
  const authUrl = "https://managed-auth.test/auth";
  env.NEON_AUTH_BASE_URL = authUrl;
  prisma.user = {
    ...originalUser,
    findUnique: async (args) => args.where.neonAuthId
      ? { id: args.where.neonAuthId, email: `${args.where.neonAuthId}@example.com`, emailVerifiedAt: new Date() }
      : originalUser?.findUnique(args),
  };
  globalThis.fetch = async (input, init) => {
    if (!String(input).startsWith(authUrl)) return originalFetch(input, init);
    const cookie = init.headers.Cookie ?? "";
    if (!cookie.startsWith("__Secure-neon-auth.session_token=test-")) return Response.json(null);
    const userId = cookie.slice("__Secure-neon-auth.session_token=test-".length);
    return Response.json({ user: { id: userId, email: `${userId}@example.com`, emailVerified: true }, session: { expiresAt: "2030-01-01T00:00:00Z" } });
  };
  return () => { globalThis.fetch = originalFetch; env.NEON_AUTH_BASE_URL = originalUrl; prisma.user = originalUser; };
}
