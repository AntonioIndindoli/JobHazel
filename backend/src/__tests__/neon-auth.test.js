import test from "node:test";
import assert from "node:assert/strict";
import { env } from "../config/env.js";
import { neonRequest, readManagedSession, resolveUser, sessionCredential, sendManagedSession } from "../services/neon-auth.services.js";
import { protectSessionOrigin } from "../middleware/session-origin.middleware.js";

env.NEON_AUTH_BASE_URL = "https://auth.example.test/auth";
const user = { id: "local-user", email: "test@example.test" };
const identity = { id: "managed-user", email: user.email, emailVerified: true };
const session = { expiresAt: "2030-01-01T00:00:00.000Z" };
const prisma = { user: { findUnique: async () => user }, $transaction: (fn) => fn({ $queryRaw: async () => [], user: { findUnique: async () => user } }) };

test("parallel session checks reuse the managed credential without consuming it", async () => {
  let calls = 0;
  const fetcher = async (_url, init) => {
    assert.equal(init.headers.Cookie, "__Secure-neon-auth.session_token=opaque.signed");
    calls++;
    return Response.json({ user: identity, session });
  };
  const results = await Promise.all(Array.from({ length: 8 }, () => readManagedSession("opaque.signed", { fetcher, prisma })));
  assert.equal(calls, 8);
  assert.ok(results.every((value) => value.user.id === user.id && value.credential === "opaque.signed"));
});
test("network errors, rate limits, malformed responses and upstream outages are retryable, not sign-outs", async () => {
  for (const fetcher of [async () => { throw new TypeError("offline"); }, async () => new Response("bad gateway", { status: 502 }), async () => new Response("limit", { status: 429 }), async () => new Response("invalid JSON")]) {
    await assert.rejects(readManagedSession("opaque.signed", { fetcher, prisma }), { status: 503, code: "AUTH_UNAVAILABLE" });
  }
});
test("a confirmed missing managed session is a 401", async () => {
  await assert.rejects(readManagedSession("opaque.signed", { fetcher: async () => Response.json(null), prisma }), { status: 401, code: "SESSION_EXPIRED" });
});
test("unverified identities cannot access application data", async () => {
  await assert.rejects(resolveUser({ ...identity, emailVerified: false }, prisma), { status: 403 });
});
test("existing local accounts are never linked solely by matching email", async () => {
  let reads = 0;
  const db = { user: { findUnique: async () => null }, $transaction: (fn) => fn({ $queryRaw: async () => [], user: { findUnique: async () => ++reads === 1 ? null : user } }) };
  await assert.rejects(resolveUser(identity, db), { code: "ACCOUNT_MIGRATION_REQUIRED" });
});
test("web session response keeps the credential HttpOnly", () => {
  let payload, cookie;
  sendManagedSession({ setHeader() {}, cookie: (...args) => { cookie = args; }, json: (value) => { payload = value; } }, { credential: "secret", user, data: { session } });
  assert.equal(cookie[2].httpOnly, true);
  assert.equal(cookie[2].path, "/");
  assert.equal(payload.accessToken, "cookie-session");
  assert.ok(!JSON.stringify(payload).includes("secret"));
});
test("malformed cookie values cannot crash requests or inject upstream headers", async () => {
  assert.equal(sessionCredential({ headers: { cookie: "jobhazel_session=%ZZ" } }), null);
  await assert.rejects(neonRequest("/get-session", { credential: "token; injected=value" }), { status: 401 });
});
test("cookie mutations require an allowed origin", () => {
  let status, called = false;
  const res = { status(value) { status = value; return this; }, json() {} };
  protectSessionOrigin({ method: "POST", headers: { cookie: "jobhazel_session=x", origin: "https://attacker.test" } }, res, () => { called = true; });
  assert.equal(status, 403); assert.equal(called, false);
});
