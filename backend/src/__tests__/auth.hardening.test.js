import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import { login, verifyEmail, resetPassword, refreshSession, updateProfile, requestPasswordReset, resendVerification, signup, verifyAccessToken } from "./helpers/legacy-auth.fixture.js";
import { cleanupAuthTokens } from "../services/auth-maintenance.services.js";
import { sendAccountEmail } from "../services/email.services.js";
import { rateLimitAuth, AUTH_RATE_LIMITS } from "../middleware/auth-rate-limit.middleware.js";
import authRoutes from "../routes/auth.routes.js";
import { errorHandler } from "../middleware/error.middleware.js";
import { setPrismaForTests } from "../db/prisma.js";

const raw = "a".repeat(40);
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const passwordHash = `120000:salt:${crypto.pbkdf2Sync("password123", "salt", 120000, 64, "sha512").toString("hex")}`;
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((clause) => matches(row, clause));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("gt" in value) return row[key] > value.gt;
      if ("lte" in value) return row[key] <= value.lte;
      if ("not" in value) return row[key] !== value.not;
    }
    return row[key] === value;
  });
}
function fixture(purpose = "EMAIL_VERIFICATION") {
  const state = {
    user: [{ id: "u", name: "Test", email: "test@example.com", emailVerifiedAt: new Date(), passwordHash }],
    authToken: [{ id: "t", userId: "u", email: "test@example.com", tokenHash: hash(raw), purpose, expiresAt: new Date(Date.now() + 60000), usedAt: null }],
    refreshToken: [{ id: "r", userId: "u", tokenHash: hash(raw), expiresAt: new Date(Date.now() + 60000), revokedAt: null }],
    authRateLimit: [],
  };
  const prisma = {};
  for (const [name, rows] of Object.entries(state)) {
    prisma[name] = {
      findUnique: async ({ where }) => structuredClone(rows.find((row) => matches(row, where)) ?? null),
      count: async () => rows.length,
      create: async ({ data }) => { const row = { id: `${name}-${rows.length}`, usedAt: null, revokedAt: null, emailVerifiedAt: null, ...data }; rows.push(row); return structuredClone(row); },
      update: async ({ where, data }) => { const row = rows.find((row) => matches(row, where)); assert.ok(row); Object.assign(row, data); return structuredClone(row); },
      updateMany: async ({ where, data }) => { const selected = rows.filter((row) => matches(row, where)); selected.forEach((row) => Object.assign(row, data)); return { count: selected.length }; },
      deleteMany: async ({ where }) => { const selected = rows.filter((row) => matches(row, where)); selected.forEach((row) => rows.splice(rows.indexOf(row), 1)); return { count: selected.length }; },
    };
  }
  prisma.$transaction = async (operation) => typeof operation === "function" ? operation(prisma) : Promise.all(operation);
  const counters = new Map();
  prisma.$queryRaw = async (strings, ...values) => {
    if (!strings.join("").includes('INSERT INTO "AuthRateLimit"')) return [];
    const [key, expiresAt, now] = values;
    let row = counters.get(key);
    if (!row || row.expiresAt <= now) row = { count: 0, expiresAt };
    row.count += 1;
    counters.set(key, row);
    return [structuredClone(row)];
  };
  return { prisma, state };
}
afterEach(() => setPrismaForTests(null));

for (const purpose of ["EMAIL_VERIFICATION", "PASSWORD_RESET"]) {
  const consume = (prisma) => purpose === "EMAIL_VERIFICATION" ? verifyEmail(raw, { prisma }) : resetPassword(raw, "replacement123", { prisma });
  for (const condition of ["expired", "used", "wrong-purpose", "wrong-address", "legacy"]) {
    test(`${purpose} rejects ${condition} tokens without changing the user or sessions`, async () => {
      const { prisma, state } = fixture(purpose);
      const token = state.authToken[0];
      if (condition === "expired") token.expiresAt = new Date(Date.now() - 1);
      if (condition === "used") token.usedAt = new Date();
      if (condition === "wrong-purpose") token.purpose = purpose === "PASSWORD_RESET" ? "EMAIL_VERIFICATION" : "PASSWORD_RESET";
      if (condition === "wrong-address") token.email = "old@example.com";
      if (condition === "legacy") token.email = null;
      const before = structuredClone({ user: state.user, refresh: state.refreshToken });
      assert.equal((await consume(prisma)).status, 400);
      assert.deepEqual({ user: state.user, refresh: state.refreshToken }, before);
    });
  }
  test(`${purpose} is consumed once under concurrent requests and cannot be reused`, async () => {
    const { prisma, state } = fixture(purpose);
    const results = await Promise.all([consume(prisma), consume(prisma)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
    assert.equal((await consume(prisma)).status, 400);
    if (purpose === "PASSWORD_RESET") {
      assert.ok(state.refreshToken[0].revokedAt);
      assert.notEqual(state.user[0].passwordHash, passwordHash);
      assert.equal((await refreshSession(raw, { prisma })).status, 401);
    }
  });
}

test("refresh rotation accepts one concurrent consumer and rejects revoked, expired, and unverified sessions", async () => {
  const { prisma, state } = fixture();
  const results = await Promise.all([refreshSession(raw, { prisma }), refreshSession(raw, { prisma })]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 401]);
  assert.equal(state.refreshToken.length, 2);
  assert.equal((await refreshSession(raw, { prisma })).status, 401);
  for (const kind of ["expired", "unverified"]) {
    const f = fixture();
    if (kind === "expired") f.state.refreshToken[0].expiresAt = new Date(0);
    else f.state.user[0].emailVerifiedAt = null;
    assert.equal((await refreshSession(raw, { prisma: f.prisma })).status, 401);
    assert.equal(f.state.refreshToken.length, 1);
  }
});

test("login rejects unknown email, bad password, and unverified accounts without issuing sessions", async () => {
  for (const kind of ["unknown", "password", "unverified"]) {
    const { prisma, state } = fixture();
    if (kind === "unknown") state.user.length = 0;
    if (kind === "unverified") state.user[0].emailVerifiedAt = null;
    const result = await login({ email: "test@example.com", password: kind === "password" ? "wrong" : "password123" }, { prisma });
    assert.equal(result.status, kind === "unverified" ? 403 : 401);
    assert.equal(state.refreshToken.length, 1);
  }
});

test("email change clears trust, revokes sessions, invalidates old links and verifies only the new address", async () => {
  const { prisma, state } = fixture();
  let sent;
  const result = await updateProfile("u", { email: "NEW@example.com" }, { prisma, sendEmail: async (mail) => { sent = mail; } });
  assert.equal(result.body.user.emailVerifiedAt, null);
  assert.equal(verifyAccessToken(result.body.accessToken).email, undefined);
  assert.ok(state.refreshToken[0].revokedAt);
  assert.equal((await verifyEmail(raw, { prisma })).status, 400);
  assert.equal(sent.to, "new@example.com");
  const token = new URL(sent.actionUrl).searchParams.get("verify");
  assert.equal((await verifyEmail(token, { prisma })).status, 200);
  assert.ok(state.user[0].emailVerifiedAt);
});

test("unchanged normalized email preserves verification and sessions", async () => {
  const { prisma, state } = fixture();
  const result = await updateProfile("u", { email: " TEST@example.com " }, { prisma, sendEmail: async () => assert.fail("unexpected email") });
  assert.ok(result.body.user.emailVerifiedAt);
  assert.equal(state.refreshToken[0].revokedAt, null);
});

for (const operation of ["signup", "resend", "reset", "profile"]) {
  test(`${operation} handles email failure without leaving a usable undelivered token`, async () => {
    const { prisma, state } = fixture();
    const overrides = { prisma, sendEmail: async () => { throw new Error("Resend unavailable"); } };
    let promise;
    if (operation === "signup") promise = signup({ email: "other@example.com", password: "password123" }, prisma, overrides);
    if (operation === "resend") { state.user[0].emailVerifiedAt = null; promise = resendVerification("test@example.com", overrides); }
    if (operation === "reset") promise = requestPasswordReset("test@example.com", overrides);
    if (operation === "profile") promise = updateProfile("u", { email: "new@example.com" }, overrides);
    await assert.rejects(promise, (error) => error.status === 503 && error.code === "AUTH_EMAIL_UNAVAILABLE");
    if (operation === "profile") assert.equal(state.user[0].emailVerifiedAt, null);
    assert.ok(state.authToken.every((token) => token.tokenHash === hash(raw)));
    assert.equal(state.refreshToken.length, 1);
  });
}

test("Resend HTTP and network failures propagate", async () => {
  const mail = { to: "test@example.com", subject: "Test", heading: "Test", copy: "Test", actionLabel: "Verify", actionUrl: "https://example.com" };
  for (const fetchImpl of [async () => ({ ok: false, status: 503, text: async () => "unavailable" }), async () => { throw new Error("network"); }]) {
    await assert.rejects(sendAccountEmail(mail, { config: { RESEND_API_KEY: "test", EMAIL_FROM: "test@example.com" }, fetchImpl }));
  }
});

test("cleanup removes expired/used auth tokens, expired/revoked sessions and expired quota rows, preserving live records", async () => {
  const { prisma, state } = fixture();
  state.authToken.push({ id: "expired", expiresAt: new Date(0) }, { id: "used", usedAt: new Date(), expiresAt: new Date(Date.now() + 50000) });
  state.refreshToken.push({ id: "expired", expiresAt: new Date(0) }, { id: "revoked", revokedAt: new Date(), expiresAt: new Date(Date.now() + 50000) });
  state.authRateLimit.push({ key: "old", expiresAt: new Date(0) }, { key: "live", expiresAt: new Date(Date.now() + 50000) });
  // Explicit nulls match SQL nullable columns.
  for (const row of state.authToken) { row.usedAt ??= null; row.email ??= "test@example.com"; }
  for (const row of state.refreshToken) row.revokedAt ??= null;
  assert.deepEqual(await cleanupAuthTokens({ prisma }), { authTokens: 2, refreshTokens: 2, rateLimits: 1 });
  assert.equal(state.authToken[0].id, "t");
  assert.equal(state.refreshToken[0].id, "r");
  assert.deepEqual(await cleanupAuthTokens({ prisma }), { authTokens: 0, refreshTokens: 0, rateLimits: 0 });
});

async function withServer(app, fn) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("actual auth routes enforce email quotas, including shared web/extension login quota", async () => {
  const { prisma, state } = fixture();
  state.user.length = 0;
  setPrismaForTests(prisma);
  const app = express(); app.use(express.json()); app.use("/auth", authRoutes); app.use(errorHandler);
  await withServer(app, async (url) => {
    for (const [action, limits] of Object.entries(AUTH_RATE_LIMITS)) {
      // Invalid passwords avoid creating accounts while still consuming the signup quota.
      for (let i = 0; i <= limits.email; i++) {
        const route = action === "login" && i % 2 ? "extension/login" : action;
        const response = await fetch(`${url}/auth/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: i % 2 ? " TEST@example.com " : "test@example.com", password: "x" }) });
        if (i === limits.email) { assert.equal(response.status, 429); assert.ok(Number(response.headers.get("retry-after")) > 0); }
        else assert.notEqual(response.status, 429);
      }
    }
  });
});

test("IP quota cannot be bypassed by rotating emails or spoofing forwarded headers", async () => {
  const { prisma } = fixture(); setPrismaForTests(prisma);
  const app = express(); app.use(express.json()); app.post("/", rateLimitAuth("signup"), (_req, res) => res.sendStatus(204));
  await withServer(app, async (url) => {
    for (let i = 0; i <= AUTH_RATE_LIMITS.signup.ip; i++) {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `192.0.2.${i}` }, body: JSON.stringify({ email: `user${i}@example.com` }) });
      assert.equal(response.status, i === AUTH_RATE_LIMITS.signup.ip ? 429 : 204);
    }
  });
});

test("recovery API rejects legacy tokens and malformed verification codes", async () => {
  const { prisma } = fixture(); setPrismaForTests(prisma);
  const app = express(); app.use(express.json()); app.use("/auth", authRoutes); app.use(errorHandler);
  await withServer(app, async (url) => {
    for (const route of ["verify-email", "reset-password"]) {
      for (const body of [{ token: raw, newPassword: "replacement123" }, { email: "test@example.com", otp: "invalid", newPassword: "replacement123" }]) {
        const response = await fetch(`${url}/auth/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        assert.equal(response.status, 400);
      }
    }
  });
});
test("rate limits reset after their window and share email quota across IPs", async () => {
  const { consumeAuthRateLimit, AUTH_RATE_WINDOW_MS } = await import("../middleware/auth-rate-limit.middleware.js");
  const { prisma } = fixture();
  const now = new Date();
  const consume = (action, dimension, value) => consumeAuthRateLimit(action, dimension, value, { prisma, now });
  const middleware = rateLimitAuth("forgot-password", consume);
  for (let i = 0; i < 4; i++) {
    let status = 0;
    const res = { setHeader() {}, status(value) { status = value; return this; }, json() {} };
    await middleware({ ip: `192.0.2.${i}`, body: { email: "test@example.com" } }, res, () => { status = 204; });
    assert.equal(status, i === 3 ? 429 : 204);
  }
  assert.equal((await consumeAuthRateLimit("forgot-password", "email", "test@example.com", { prisma, now: new Date(now.getTime() + AUTH_RATE_WINDOW_MS) })).allowed, true);
});

test("rate limit database failure fails closed", async () => {
  const app = express(); app.use(express.json());
  app.post("/", rateLimitAuth("login", async () => { throw new Error("database unavailable"); }), () => assert.fail("handler should not execute"));
  app.use(errorHandler);
  await withServer(app, async (url) => assert.equal((await fetch(url, { method: "POST" })).status, 500));
});
