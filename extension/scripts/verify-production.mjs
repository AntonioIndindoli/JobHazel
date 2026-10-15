// Anonymous probes only: no accounts, credentials, imports or email are created.
import assert from "node:assert/strict";
import { readProductionRelease } from "./release.mjs";

const { manifest, extensionId } = await readProductionRelease();
const origin = `chrome-extension://${process.argv[2] ?? extensionId}`;
assert.match(origin, /^chrome-extension:\/\/[a-p]{32}$/);
const apiUrl = "https://api.jobhazel.com";
const checks = [];
async function check(name, action) {
  try { await action(); checks.push({ name, ok: true }); }
  catch (error) { checks.push({ name, ok: false, error: error.message }); }
}
const request = (url, init = {}) => fetch(url, {
  ...init, redirect: "error", signal: AbortSignal.timeout(20_000),
});
await check("Production app reachable", async () => {
  const response = await fetch("https://jobhazel.com/", { signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200);
  assert.ok(["https://jobhazel.com", "https://www.jobhazel.com"].includes(new URL(response.url).origin));
});
await check("API and required schema ready", async () => {
  const response = await request(`${apiUrl}/health/ready`, { headers: { Origin: origin } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});
for (const route of ["/auth/extension/login", "/auth/extension/refresh", "/auth/extension/logout", "/imports/create-draft", "/imports/release-probe/convert"]) {
  await check(`Extension CORS: ${route}`, async () => {
    const response = await request(`${apiUrl}${route}`, {
      method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,authorization,idempotency-key" },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    const allowed = response.headers.get("access-control-allow-headers")?.toLowerCase().split(/\s*,\s*/) ?? [];
    for (const header of ["content-type", "authorization", "idempotency-key"]) assert.ok(allowed.includes(header));
  });
}
await check("Extension auth routes deployed", async () => {
  for (const route of ["login", "refresh", "logout"]) {
    const response = await request(`${apiUrl}/auth/extension/${route}`, {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{}",
    });
    assert.equal(response.status, 400, `${route} must reject an invalid body without calling the auth provider`);
  }
});
await check("Maximum escaped capture accepted by body parser, then requires authentication", async () => {
  const response = await request(`${apiUrl}/imports/create-draft`, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ pageTitle: "Release probe", rawText: "\u0001".repeat(100_000) }),
  });
  assert.equal(response.status, 401, "Deploy the API capture-body fix if this returns 413");
});
await check("Untrusted origin rejected", async () => {
  const response = await request(`${apiUrl}/auth/extension/refresh`, {
    method: "POST", headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" }, body: "{}",
  });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});
const ok = checks.every((result) => result.ok);
console.log(JSON.stringify({ ok, version: manifest.version, origin, checks,
  manualChecks: ["Use an authorized existing account to sign in, capture, edit, save, reopen, and sign out in Chrome.",
    "Verify the store-issued extension ID and deploy matching EXTENSION_ORIGINS before publishing."] }, null, 2));
if (!ok) process.exitCode = 1;
