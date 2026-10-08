import test from "node:test";
import assert from "node:assert/strict";
import { acquireProviderSlot, rateLimitedProviderFetch, providerRetryAfter } from "../services/provider-rate-limit.services.js";
import { runMonitor, checkNotifications } from "../../scripts/monitor-notifications.mjs";
import { runDailyNotifications } from "../services/notification-operations.services.js";

test("global account gate admits one concurrent request and preserves cooldown", async () => {
  let available = true;
  const scopes = [];
  const prisma = {
    $executeRaw: async (_sql, scope) => scopes.push(scope),
    $queryRaw: async (sql) => {
      if (sql.join("").includes("UPDATE")) { const ok = available; available = false; return ok ? [{ scope: "team" }] : []; }
      return [{ waitMs: 90000 }];
    },
  };
  const config = { RESEND_RATE_LIMIT_SCOPE: "team" };
  const results = await Promise.allSettled([acquireProviderSlot({ prisma, config }), acquireProviderSlot({ prisma, config })]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.find(r => r.status === "rejected").reason.retryAfterMs, 90000);
  assert.deepEqual(scopes, ["team", "team"]);
});

test("shared cooldown prevents network calls, and 429 propagates provider Retry-After to every caller", async () => {
  await assert.rejects(rateLimitedProviderFetch("https://example.com", {}, {
    acquire: async () => { throw Object.assign(Error("busy"), { throttled: true, retryAfterMs: 90000 }); },
    fetchImpl: () => assert.fail("must not send during cooldown"),
  }), { safeToRetry: true, retryAfterMs: 90000 });
  let blocked = false;
  const response = new Response("", { status: 429, headers: { "Retry-After": "90" } });
  assert.equal(await rateLimitedProviderFetch("https://example.com", {}, {
    acquire: async () => {}, fetchImpl: async () => response,
    block: async (r) => { blocked = true; assert.equal(providerRetryAfter(r), 90000); },
  }), response);
  assert.ok(blocked);
  assert.equal(providerRetryAfter(new Response("", { headers: { "Retry-After": "Thu, 01 Oct 2026 00:02:00 GMT" } }), Date.parse("2026-10-01T00:00Z")), 120000);
});

test("worker lease prevents overlapping discovery and delivery", async () => {
  const config = { NOTIFICATION_MODE: "drain", RESEND_API_KEY: "fake" };
  const prisma = { $executeRaw: async () => {}, notificationWorkerState: {
    upsert: async () => {}, updateMany: async () => ({ count: 0 }),
  } };
  assert.deepEqual(await runDailyNotifications({ prisma, config }), { busy: true, incomplete: false });
});

test("independent monitor reports missed workers and safely handles auth/network/DB failures", async () => {
  const alerts = [{ code: "WORKER_MISSED", severity: "critical", message: "Worker stale", action: "Check scheduler" }];
  const calls = [];
  const logs = [];
  const exit = await runMonitor({ origin: "https://api.example.com", secret: "secret", webhook: "https://alerts.example.com", log: s => logs.push(s),
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return url.endsWith("/status") ? Response.json({ status: { alerts } }, { status: 503 }) : new Response();
    },
  });
  assert.equal(exit, 1);
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret");
  assert.equal(calls[1].init.headers.Authorization, undefined);
  assert.equal(logs.join("").includes("secret"), false);
  assert.deepEqual(JSON.parse(calls[1].init.body).alerts, alerts);
  assert.equal(await runMonitor({ fetchImpl: async () => Response.json({ status: { alerts: [] } }), log: () => assert.fail("healthy monitor stays quiet") }), 0);
  for (const fetchImpl of [async () => { throw Error("DB password secret"); }, async () => new Response("Unauthorized", { status: 401 })]) {
    const result = await checkNotifications({ fetchImpl });
    assert.equal(result[0].code, "MONITOR_UNAVAILABLE");
    assert.equal(JSON.stringify(result).includes("secret"), false);
  }
});
