import {
  buildAccountExport,
  changePassword,
  createApplicationsCsv,
  deleteAccount,
  getAccountUser,
  login,
  loginExtension,
  refreshSession,
  revokeSession,
  signup,
  updateProfile,
} from "../services/auth.services.js";
import { env } from "../config/env.js";

const REFRESH_COOKIE_NAME = "refresh_token";

function getCookie(req, name) {
  const raw = req.headers.cookie ?? "";
  for (const pair of raw.split(";")) {
    const [k, ...v] = pair.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}


function getCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    path: "/auth",
    expires: expiresAt,
  };
}

function sendSessionResponse(res, result) {
  if (!result?.body?.refreshToken || !result?.body?.refreshTokenExpiresAt) {
    return res.status(result.status).json(result.body);
  }

  const { refreshToken, refreshTokenExpiresAt, ...publicBody } = result.body;
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getCookieOptions(refreshTokenExpiresAt));
  return res.status(result.status).json(publicBody);
}

export async function signupController(req, res) {
  const { name, email, password } = req.body;
  const result = await signup({ name, email, password });
  return sendSessionResponse(res, result);
}

export async function loginController(req, res) {
  const { email, password } = req.body;
  const result = await login({ email, password });
  return sendSessionResponse(res, result);
}

export async function refreshController(req, res) {
  const result = await refreshSession(getCookie(req, REFRESH_COOKIE_NAME));
  return sendSessionResponse(res, result);
}

export async function logoutController(req, res) {
  await revokeSession(getCookie(req, REFRESH_COOKIE_NAME));
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/auth" });
  return res.status(204).send();
}

export async function extensionLoginController(req, res) {
  const result = await loginExtension(req.body);
  if (result.status !== 200) return res.status(result.status).json(result.body);
  const { refreshTokenExpiresAt, ...body } = result.body;
  return res.status(200).json({ ...body, refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString() });
}

export async function extensionRefreshController(req, res) {
  const result = await refreshSession(req.body.refreshToken);
  if (result.status !== 200) return res.status(result.status).json(result.body);
  const { refreshTokenExpiresAt, ...body } = result.body;
  return res.status(200).json({ ...body, refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString() });
}

export async function extensionLogoutController(req, res) {
  await revokeSession(req.body.refreshToken);
  return res.status(204).send();
}

export async function meController(req, res) {
  const user = await getAccountUser(req.auth.sub);
  if (!user) return res.status(404).json({ message: "Account not found." });
  return res.status(200).json({ user });
}

export async function updateProfileController(req, res) {
  const result = await updateProfile(req.auth.sub, req.body);
  return res.status(result.status).json(result.body);
}

export async function changePasswordController(req, res) {
  const result = await changePassword(
    req.auth.sub,
    req.body.currentPassword,
    req.body.newPassword,
  );
  return sendSessionResponse(res, result);
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
  const result = await deleteAccount(req.auth.sub, req.body.password);
  if (result.status !== 204) return res.status(result.status).json(result.body);
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/auth" });
  return res.status(204).send();
}
