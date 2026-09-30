// Test-only executable: real Express/Prisma, simulated external auth and storage.
// Never imported by the deployed app. No network requests leave this process.
import { randomUUID } from "node:crypto";
import express from "express";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !process.env.E2E_DATABASE_HOST || new URL(databaseUrl).hostname !== process.env.E2E_DATABASE_HOST) {
  throw new Error("Set E2E_DATABASE_URL and its exact E2E_DATABASE_HOST to an isolated test database.");
}
if (new URL(databaseUrl).hostname.includes("ep-solitary-water-arfby5fm")) throw new Error("Production is forbidden.");
Object.assign(process.env, {
  DATABASE_URL: databaseUrl, NODE_ENV: "test", PORT: "4100", NEON_AUTH_BASE_URL: "https://e2e-auth.invalid/auth",
  AUTH_RATE_LIMIT_SECRET: randomUUID(), APP_URL: "http://127.0.0.1:3100", CORS_ORIGIN: "http://127.0.0.1:3100",
  COOKIE_SECURE: "false", COOKIE_SAME_SITE: "lax", NOTIFICATION_MODE: "legacy",
  R2_ACCOUNT_ID: "", R2_ACCESS_KEY_ID: "", R2_SECRET_ACCESS_KEY: "", R2_BUCKET_NAME: "", R2_ENDPOINT: "",
  RESEND_API_KEY: "", RESEND_WEBHOOK_SECRET: "", NOTIFICATION_UNSUBSCRIBE_SECRET: "", API_PUBLIC_URL: "http://127.0.0.1:4100",
});
const users = new Map();
const sessions = new Map();
const objects = new Map();
const links = new Map();
const cookieName = "__Secure-neon-auth.session_token";
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (!url.startsWith(process.env.NEON_AUTH_BASE_URL + "/")) throw new Error("External network disabled in browser tests.");
  const path = url.slice(process.env.NEON_AUTH_BASE_URL.length);
  const body = JSON.parse(init.body ?? "{}");
  const credential = new Headers(init.headers).get("Cookie")?.slice(cookieName.length + 1);
  const sessionUser = sessions.get(credential);
  const user = users.get(body.email);
  const error = (message, status = 400) => Response.json({ message }, { status });
  if (path === "/sign-up/email") {
    if (!body.email.endsWith("@example.test") || user) return error("Use a unique test email.");
    users.set(body.email, { id: randomUUID(), email: body.email, name: body.name, password: body.password, emailVerified: false, verification: "123456" });
    return Response.json({});
  }
  if (path === "/email-otp/verify-email") {
    if (!user || body.otp !== user.verification) return error("Invalid verification code.");
    user.emailVerified = true; user.verification = null; return Response.json({});
  }
  if (path === "/email-otp/send-verification-otp") { if (user) user.verification = "123456"; return Response.json({}); }
  if (path === "/email-otp/request-password-reset") { if (user) user.recovery = "654321"; return Response.json({}); }
  if (path === "/email-otp/reset-password") {
    if (!user || body.otp !== user.recovery) return error("Invalid recovery code.");
    user.password = body.password; user.recovery = null;
    for (const [key, value] of sessions) if (value === user) sessions.delete(key);
    return Response.json({});
  }
  if (path === "/sign-in/email") {
    if (!user || user.password !== body.password) return error("Invalid credentials.", 401);
    if (!user.emailVerified) return Response.json({ code: "EMAIL_NOT_VERIFIED", message: "Verify your email." }, { status: 403 });
    const token = randomUUID(); sessions.set(token, user);
    return Response.json({}, { headers: { "Set-Cookie": `${cookieName}=${token}; HttpOnly; Secure; Path=/` } });
  }
  if (path === "/get-session") return Response.json(sessionUser ? {
    user: { id: sessionUser.id, email: sessionUser.email, name: sessionUser.name, emailVerified: sessionUser.emailVerified },
    session: { expiresAt: new Date(Date.now() + 3600000).toISOString() },
  } : null);
  if (path === "/sign-out") { sessions.delete(credential); return Response.json({}); }
  throw new Error(`Unexpected fake auth operation: ${path}`);
};

const { createApp } = await import("../src/app.js");
const { env } = await import("../src/config/env.js");
const { getPrismaAsync, disconnectPrisma } = await import("../src/db/prisma.js");
const { setResumeStorageForTests } = await import("../src/services/resume-storage.services.js");
const prisma = await getPrismaAsync();
// Local CI has no managed provider schema; this minimal fixture supports the
// real recovery controller's session revocation query. Remote branches own it.
if (["127.0.0.1", "localhost"].includes(process.env.E2E_DATABASE_HOST)) {
  if (new URL(databaseUrl).pathname !== "/jobhazel_e2e") throw new Error("Local E2E database must be named jobhazel_e2e.");
  await prisma.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS neon_auth');
  await prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS neon_auth.session (id uuid PRIMARY KEY, "userId" uuid)');
}
env.RESUME_STORAGE_ENABLED = true;
function signedLink(key, method) {
  const token = randomUUID(); links.set(token, { key, method });
  return `http://127.0.0.1:4100/__storage/${token}`;
}
setResumeStorageForTests({
  presignUpload: async ({ key }) => signedLink(key, "PUT"),
  presignDownload: async ({ key }) => signedLink(key, "GET"),
  inspectObject: async (key) => objects.has(key) ? { sizeBytes: objects.get(key).length, contentType: "application/pdf" } : null,
  readObjectRange: async (key, { start = 0, end = 4 } = {}) => objects.get(key).subarray(start, end + 1),
  deleteObject: async (key) => { objects.delete(key); },
});
const app = express();
async function cleanup() {
  await prisma.user.deleteMany({ where: { neonAuthId: { in: [...users.values()].map((user) => user.id) } } });
}
app.post("/__e2e/cleanup", async (req, res) => {
  if (!process.env.E2E_CONTROL_TOKEN || req.headers.authorization !== `Bearer ${process.env.E2E_CONTROL_TOKEN}`) return res.sendStatus(403);
  await cleanup(); res.sendStatus(204);
});
app.use("/__storage", (req, res, next) => {
  res.set("Access-Control-Allow-Origin", process.env.APP_URL);
  res.set("Access-Control-Allow-Methods", "GET,PUT,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.all("/__storage/:token", express.raw({ type: "*/*", limit: "6mb" }), (req, res) => {
  const link = links.get(req.params.token);
  if (!link || link.method !== req.method) return res.sendStatus(403);
  if (req.method === "PUT") { objects.set(link.key, req.body); return res.sendStatus(200); }
  if (!objects.has(link.key)) return res.sendStatus(404);
  res.set("Content-Type", "application/pdf");
  res.set("Content-Disposition", 'attachment; filename="resume.pdf"');
  res.send(objects.get(link.key));
});
app.use(createApp());
const server = app.listen(4100, "127.0.0.1", () => console.log("E2E API ready on 4100"));
async function shutdown() {
  server.close();
  await cleanup();
  await disconnectPrisma();
  process.exit();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
