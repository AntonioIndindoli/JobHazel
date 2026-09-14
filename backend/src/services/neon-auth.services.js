import { env } from "../config/env.js";
import { getPrismaAsync } from "../db/prisma.js";

export const SESSION_COOKIE = "jobhazel_session";
const NEON_COOKIE = "__Secure-neon-auth.session_token";
export const USER_SELECT = { id: true, name: true, email: true, emailVerifiedAt: true, createdAt: true };

export function authError(status, message, code) {
  return Object.assign(new Error(message), { status, code, exposeCode: true });
}

// The value is Neon's signed opaque session cookie, never a locally issued JWT.
export function sessionCredential(req) {
  const authorization = req.headers.authorization ?? "";
  if (authorization.startsWith("Bearer ") && authorization !== "Bearer cookie-session") return authorization.slice(7);
  const cookie = (req.headers.cookie ?? "").split(";").find((part) => part.trim().startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) return null;
  try { return decodeURIComponent(cookie.trim().slice(SESSION_COOKIE.length + 1)); }
  catch { return null; }
}

export function sessionCookieOptions(expiresAt) {
  return { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SAME_SITE, path: "/", ...(expiresAt ? { expires: new Date(expiresAt) } : {}) };
}

export async function neonRequest(path, { credential, body, method = body ? "POST" : "GET", fetcher = fetch } = {}) {
  if (!env.NEON_AUTH_BASE_URL) throw authError(503, "Authentication is not configured.", "AUTH_UNAVAILABLE");
  if (credential && !/^[A-Za-z0-9%._~+\/=\-]+$/.test(credential)) throw authError(401, "Invalid session.", "SESSION_EXPIRED");
  let response;
  try {
    response = await fetcher(`${env.NEON_AUTH_BASE_URL}${path}`, {
      method, redirect: "manual", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json", Origin: env.APP_URL, ...(credential ? { Cookie: `${NEON_COOKIE}=${credential}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw authError(503, "Authentication is temporarily unavailable. Please retry.", "AUTH_UNAVAILABLE"); }
  if (response.status >= 500 || response.status === 429) throw authError(503, "Authentication is temporarily unavailable. Please retry.", "AUTH_UNAVAILABLE");
  let data;
  try { data = await response.json(); }
  catch { throw authError(503, "Unexpected authentication response.", "AUTH_UNAVAILABLE"); }
  if (!response.ok) throw authError(response.status, data?.message ?? "Authentication failed.", data?.code);
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith(`${NEON_COOKIE}=`));
  return { data, credential: cookie ? cookie.split(";")[0].slice(NEON_COOKIE.length + 1) : credential };
}

export async function resolveUser(neonUser, prismaOverride) {
  if (!neonUser?.id || !neonUser.emailVerified) throw authError(403, "Verify your email before signing in.", "EMAIL_NOT_VERIFIED");
  const prisma = prismaOverride ?? await getPrismaAsync();
  const linkedUser = await prisma.user.findUnique({ where: { neonAuthId: neonUser.id }, select: USER_SELECT });
  if (linkedUser) return linkedUser;
  return prisma.$transaction(async (tx) => {
    // Keep the application account cap and provision one local profile per identity.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(734901, 1)::text AS locked`;
    const linked = await tx.user.findUnique({ where: { neonAuthId: neonUser.id }, select: USER_SELECT });
    if (linked) return linked;
    const email = neonUser.email.toLowerCase();
    const existing = await tx.user.findUnique({ where: { email } });
    // Existing accounts must be explicitly linked by the migration; never merge by email at login.
    if (existing) throw authError(409, "Your account needs migration. Please contact support.", "ACCOUNT_MIGRATION_REQUIRED");
    if (await tx.user.count() >= 1000) throw authError(409, "JobHazel has reached its 1,000-account limit.", "ACCOUNT_LIMIT");
    return tx.user.create({ data: { neonAuthId: neonUser.id, email, name: neonUser.name || null, emailVerifiedAt: new Date() }, select: USER_SELECT });
  });
}

export async function readManagedSession(credential, overrides = {}) {
  if (!credential) throw authError(401, "Sign in to continue.", "SESSION_EXPIRED");
  const result = await neonRequest("/get-session", { credential, ...overrides });
  if (!result.data?.session || !result.data?.user) throw authError(401, "Your session has expired. Sign in again.", "SESSION_EXPIRED");
  return { ...result, user: await resolveUser(result.data.user, overrides.prisma) };
}

export function sendManagedSession(res, result, extension = false) {
  const expiresAt = result.data.session.expiresAt;
  res.setHeader("Cache-Control", "no-store");
  if (extension) return res.json({ user: result.user, accessToken: result.credential, refreshToken: result.credential, refreshTokenExpiresAt: expiresAt });
  res.cookie(SESSION_COOKIE, result.credential, sessionCookieOptions(expiresAt));
  // Existing UI loaders use a truthy auth marker; the credential stays HttpOnly.
  return res.json({ user: result.user, accessToken: "cookie-session" });
}
