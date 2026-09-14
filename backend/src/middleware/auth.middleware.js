import { readManagedSession, sessionCredential, sessionCookieOptions, SESSION_COOKIE } from "../services/neon-auth.services.js";

export async function requireAuth(req, res, next) {
  try {
    const session = await readManagedSession(sessionCredential(req));
    req.managedSession = session;
    req.auth = { sub: session.user.id, email: session.user.email, name: session.user.name };
    res.setHeader("Cache-Control", "no-store");
    if (!req.headers.authorization) res.cookie(SESSION_COOKIE, session.credential, sessionCookieOptions(session.data.session.expiresAt));
    next();
  } catch (error) { next(error); }
}
