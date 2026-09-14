import { buildAccountExport, createApplicationsCsv, deleteAccount } from "../services/auth.services.js";
import { migrateLegacyPassword } from "../services/auth-password-migration.services.js";
import { authError, neonRequest, readManagedSession, sendManagedSession, sessionCredential, sessionCookieOptions, SESSION_COOKIE, USER_SELECT } from "../services/neon-auth.services.js";
import { getPrismaAsync } from "../db/prisma.js";
import { env } from "../config/env.js";

export async function signupController(req, res) {
  const prisma = await getPrismaAsync();
  if (await prisma.user.count() >= 1000) throw authError(409, "JobHazel has reached its 1,000-account limit.", "ACCOUNT_LIMIT");
  await neonRequest("/sign-up/email", { body: { ...req.body, name: req.body.name || req.body.email.split("@")[0], callbackURL: `${env.APP_URL}/?verified=1` } });
  res.status(201).json({ message: "Check your email to verify your account before signing in.", email: req.body.email });
}

async function signIn(req, res, extension) {
  await migrateLegacyPassword(req.body.email, req.body.password);
  const result = await neonRequest("/sign-in/email", { body: { ...req.body, rememberMe: true } });
  if (!result.credential) throw authError(503, "Authentication did not return a session.", "AUTH_UNAVAILABLE");
  return sendManagedSession(res, await readManagedSession(result.credential), extension);
}
export const loginController = (req, res) => signIn(req, res, false);
export const extensionLoginController = (req, res) => signIn(req, res, true);
export const refreshController = async (req, res) => sendManagedSession(res, await readManagedSession(sessionCredential(req)));
export const extensionRefreshController = async (req, res) => sendManagedSession(res, await readManagedSession(req.body.refreshToken), true);

async function signOut(req, res, credential) {
  if (credential) await neonRequest("/sign-out", { credential, body: {} });
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  res.clearCookie("refresh_token", { path: "/auth" });
  res.status(204).send();
}
export const logoutController = (req, res) => signOut(req, res, sessionCredential(req));
export const extensionLogoutController = (req, res) => signOut(req, res, req.body.refreshToken);

export async function resendVerificationController(req, res) {
  await neonRequest("/email-otp/send-verification-otp", { body: { email: req.body.email, type: "email-verification" } });
  res.json({ message: "If that account needs verification, a new code has been sent." });
}
export async function verifyEmailController(req, res) {
  await neonRequest("/email-otp/verify-email", { body: { email: req.body.email, otp: req.body.otp } });
  res.json({ message: "Email verified. You can now sign in." });
}
export async function forgotPasswordController(req, res) {
  await neonRequest("/email-otp/request-password-reset", { body: { email: req.body.email } });
  res.json({ message: "If an account exists for that email, a reset code has been sent." });
}
export async function resetPasswordController(req, res) {
  await neonRequest("/email-otp/reset-password", { body: { email: req.body.email, otp: req.body.otp, password: req.body.newPassword } });
  const prisma = await getPrismaAsync();
  const user = await prisma.user.findUnique({ where: { email: req.body.email }, select: { id: true, neonAuthId: true } });
  if (user?.neonAuthId) await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM neon_auth.session WHERE "userId" = ${user.neonAuthId}::uuid`;
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: null } });
  });
  res.json({ message: "Password reset. You can now sign in." });
}
export const meController = (req, res) => sendManagedSession(res, req.managedSession);

export async function updateProfileController(req, res) {
  if (req.body.email && req.body.email !== req.managedSession.user.email) {
    throw authError(400, "Email address changes are currently unavailable.", "EMAIL_CHANGE_UNAVAILABLE");
  }
  await neonRequest("/update-user", { credential: req.managedSession.credential, body: { name: req.body.name ?? req.managedSession.user.name ?? "" } });
  const prisma = await getPrismaAsync();
  const user = await prisma.user.update({ where: { id: req.auth.sub }, data: { name: req.body.name }, select: USER_SELECT });
  res.json({ user });
}
export async function changePasswordController(req, res) {
  const result = await neonRequest("/change-password", { credential: req.managedSession.credential, body: { ...req.body, revokeOtherSessions: true } });
  return sendManagedSession(res, await readManagedSession(result.credential));
}

export async function exportAccountController(req, res) {
  const accountExport = await buildAccountExport(req.auth.sub);
  if (!accountExport.user) return res.status(404).json({ message: "Account not found." });
  const date = new Date().toISOString().slice(0, 10);
  if (req.query.format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="jobappledger-applications-${date}.csv"`);
    return res.status(200).send(createApplicationsCsv(accountExport.applications));
  }
  res.setHeader("Content-Disposition", `attachment; filename="jobappledger-data-${date}.json"`);
  return res.status(200).json(accountExport);
}
export async function deleteAccountController(req, res) {
  await neonRequest("/verify-password", { credential: req.managedSession.credential, body: { password: req.body.password } });
  const result = await deleteAccount(req.auth.sub, req.body.password, {
    passwordVerified: true,
    // Neon does not expose delete-user on this project. Delete the managed
    // identity and its cascading sessions in the same transaction as app data.
    deleteIdentity: (tx) => tx.$executeRaw`DELETE FROM neon_auth.user WHERE id = ${req.managedSession.data.user.id}::uuid`,
  });
  if (result.status !== 204) return res.status(result.status).json(result.body);
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  return res.status(204).send();
}
