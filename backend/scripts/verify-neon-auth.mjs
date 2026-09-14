import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID, pbkdf2Sync, createHash } from "node:crypto";
import { createApp } from "../src/app.js";
import { getPrismaAsync, disconnectPrisma } from "../src/db/prisma.js";

// Deliberately refuse to exercise credentials against production.
if (!process.env.DATABASE_URL?.includes("ep-small-poetry-arn49l77") || !process.env.NEON_AUTH_BASE_URL?.includes("ep-small-poetry-arn49l77")) throw new Error("Use the isolated dev-neon-auth branch.");
const prisma = await getPrismaAsync();
const id = randomUUID();
const email = `auth-test-${id}@example.invalid`;
const password = `Test-${randomUUID()}`;
const hash = `120000:testsalt:${pbkdf2Sync(password, "testsalt", 120000, 64, "sha512").toString("hex")}`;
let local;
let server;
try {
  await prisma.$executeRaw`INSERT INTO neon_auth.user (id,name,email,"emailVerified","updatedAt") VALUES (${id}::uuid,'Auth regression',${email},TRUE,NOW())`;
  await prisma.$executeRaw`INSERT INTO neon_auth.account (id,"accountId","providerId","userId",password,"updatedAt") VALUES (${randomUUID()}::uuid,${id},'credential',${id}::uuid,NULL,NOW())`;
  local = await prisma.user.create({ data: { email, name: "Auth regression", neonAuthId: id, passwordHash: hash, emailVerifiedAt: new Date() } });
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, body, credential, method = body ? "POST" : "GET") => fetch(`${base}${path}`, {
    method, headers: { "Content-Type": "application/json", ...(credential ? { Authorization: `Bearer ${credential}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const otp = "729183";
  const identifier = `email-verification-otp-${email}`;
  await prisma.$executeRaw`UPDATE neon_auth.user SET "emailVerified" = FALSE WHERE id = ${id}::uuid`;
  const storedOtp = `${createHash("sha256").update(otp).digest("base64url")}:0`;
  await prisma.$executeRaw`INSERT INTO neon_auth.verification (id,identifier,value,"expiresAt") VALUES (${randomUUID()}::uuid,${identifier},${storedOtp},NOW() + INTERVAL '5 minutes')`;
  let verified = await request("/auth/verify-email", { email, otp });
  assert.equal(verified.status, 200, await verified.text());
  assert.equal((await request("/auth/verify-email", { email, otp })).status, 400);
  let response = await request("/auth/extension/login", { email, password: "wrong-password" });
  assert.equal(response.status, 401);
  response = await request("/auth/extension/login", { email, password });
  if (!response.ok) {
    const diagnostic = await fetch(`${process.env.NEON_AUTH_BASE_URL}/sign-in/email`, { method: "POST", headers: { "Content-Type": "application/json", Origin: process.env.APP_URL ?? "http://localhost:3000" }, body: JSON.stringify({ email, password }) });
    const body = await diagnostic.json();
    console.log({ status: diagnostic.status, keys: Object.keys(body), code: body.code, message: body.message, cookieNames: diagnostic.headers.getSetCookie().map((c) => c.split("=")[0]) });
    throw new Error(`Login failed: ${response.status} ${await response.text()}`);
  }
  let session = await response.json();
  assert.equal(session.user.id, local.id);
  assert.equal((await prisma.user.findUnique({ where: { id: local.id } })).passwordHash, null);
  const parallel = await Promise.all(Array.from({ length: 6 }, () => request("/auth/extension/refresh", { refreshToken: session.refreshToken })));
  assert.ok(parallel.every((result) => result.ok));
  assert.equal((await request("/auth/me", undefined, session.accessToken)).status, 200);
  response = await request("/auth/login", { email, password });
  assert.equal(response.status, 200);
  const webCookie = response.headers.getSetCookie().find((value) => value.startsWith("jobhazel_session="));
  assert.ok(webCookie?.includes("HttpOnly"));
  assert.equal((await response.json()).accessToken, "cookie-session");
  assert.equal((await fetch(`${base}/auth/me`, { headers: { Cookie: webCookie.split(";")[0] } })).status, 200);
  let newPassword = `Changed-${randomUUID()}`;
  response = await request("/auth/password", { currentPassword: password, newPassword }, session.accessToken, "PATCH");
  assert.equal(response.status, 200, await response.text());
  assert.equal((await request("/auth/extension/login", { email, password })).status, 401);
  const resetIdentifier = `forget-password-otp-${email}`;
  await prisma.$executeRaw`INSERT INTO neon_auth.verification (id,identifier,value,"expiresAt") VALUES (${randomUUID()}::uuid,${resetIdentifier},${storedOtp},NOW() + INTERVAL '5 minutes')`;
  newPassword = `Recovered-${randomUUID()}`;
  response = await request("/auth/reset-password", { email, otp, newPassword });
  assert.equal(response.status, 200, await response.text());
  assert.equal((await request("/auth/me", undefined, session.accessToken)).status, 401);
  assert.equal((await request("/auth/reset-password", { email, otp, newPassword })).status, 400);
  response = await request("/auth/extension/login", { email, password: newPassword });
  assert.equal(response.status, 200);
  session = await response.json();
  assert.equal((await request("/auth/extension/logout", { refreshToken: session.refreshToken })).status, 204);
  assert.equal((await request("/auth/me", undefined, session.accessToken)).status, 401);
  response = await request("/auth/extension/login", { email, password: newPassword });
  session = await response.json();
  response = await request("/auth/account", { password: newPassword }, session.accessToken, "DELETE");
  assert.equal(response.status, 204, await response.text());
  assert.equal((await request("/auth/me", undefined, session.accessToken)).status, 401);
  console.log("PASS: verification/recovery codes and replay rejection, legacy password upgrade, concurrent sessions, HttpOnly cookies, password changes, logout/revocation, account deletion.");
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (local) await prisma.user.deleteMany({ where: { id: local.id } });
  await prisma.$executeRaw`DELETE FROM neon_auth.user WHERE id = ${id}::uuid`;
  await prisma.$executeRaw`DELETE FROM neon_auth.verification WHERE identifier LIKE ${`%-otp-${email}`}`;
  await disconnectPrisma();
}
