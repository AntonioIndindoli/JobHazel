import assert from "node:assert/strict";
import crypto from "node:crypto";

const apiUrl = process.argv[2] ?? "http://localhost:4000";
const runId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const email = `extension-verification-${runId}@example.com`;
const password = `Verify-${crypto.randomBytes(12).toString("base64url")}!`;
const extensionOrigin = "chrome-extension://nlbcijcaamjlllibnbkgmbeniaiagdkl";
let accessToken = "";
let accountCreated = false;

async function request(path, init = {}) {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      origin: extensionOrigin,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });
}

async function json(response) {
  const body = await response.json().catch(() => ({}));
  assert.ok(response.ok, `${response.status} ${JSON.stringify(body)}`);
  return body;
}

try {
  const signupResponse = await request("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name: "Extension Verification", email, password }),
  });
  assert.equal(signupResponse.headers.get("access-control-allow-origin"), extensionOrigin);
  assert.equal(signupResponse.status, 201);
  accountCreated = true;

  const loginResponse = await request("/auth/extension/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const session = await json(loginResponse);
  assert.ok(session.accessToken);
  assert.ok(session.refreshToken);
  accessToken = session.accessToken;

  const captureId = crypto.randomUUID();
  const sourceUrl = `https://jobs.example.com/extension-verification/${runId}`;
  const draftResponse = await request("/imports/create-draft", {
    method: "POST",
    headers: { "Idempotency-Key": captureId },
    body: JSON.stringify({
      sourceUrl,
      sourceDomain: "jobs.example.com",
      pageTitle: "Extension Verification Engineer at Example Labs",
      rawText: "Extension Verification Engineer\nExample Labs\nLocation: Remote\nSalary: $120,000 - $140,000",
    }),
  });
  assert.equal(draftResponse.status, 201);
  const draftResult = await json(draftResponse);
  assert.ok(draftResult.importDraft.id);
  assert.equal(draftResult.importDraft.parsedTitle, "Extension Verification Engineer");

  const repeatResult = await json(await request("/imports/create-draft", {
    method: "POST",
    headers: { "Idempotency-Key": captureId },
    body: JSON.stringify({ sourceUrl, pageTitle: "Changed content must not create another draft" }),
  }));
  assert.equal(repeatResult.importDraft.id, draftResult.importDraft.id);
  assert.equal(repeatResult.reused, true);

  const restored = await json(await request(`/imports/${draftResult.importDraft.id}`));
  assert.equal(restored.importDraft.id, draftResult.importDraft.id);

  const saveResponse = await request(`/imports/${draftResult.importDraft.id}/convert`, {
    method: "POST",
    body: JSON.stringify({
      title: "Extension Verification Engineer",
      companyName: "Example Labs",
      status: "SAVED",
      source: "Company Site",
      sourceUrl,
      location: "Remote",
      salaryMin: 120000,
      salaryMax: 140000,
      dateApplied: new Date().toISOString().slice(0, 10),
    }),
  });
  assert.equal(saveResponse.status, 201);
  const saved = await json(saveResponse);
  assert.ok(saved.application.id);

  const duplicateDraft = await json(await request("/imports/create-draft", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ sourceUrl, pageTitle: "Extension Verification Engineer at Example Labs" }),
  }));
  assert.ok(duplicateDraft.duplicateCandidates.length >= 1);

  const blockedDuplicate = await request(`/imports/${duplicateDraft.importDraft.id}/convert`, {
    method: "POST",
    body: JSON.stringify({ title: "Extension Verification Engineer", companyName: "Example Labs", sourceUrl }),
  });
  assert.equal(blockedDuplicate.status, 409);

  const allowedDuplicate = await request(`/imports/${duplicateDraft.importDraft.id}/convert`, {
    method: "POST",
    body: JSON.stringify({
      title: "Extension Verification Engineer",
      companyName: "Example Labs",
      sourceUrl,
      allowDuplicate: true,
      dateApplied: new Date().toISOString().slice(0, 10),
    }),
  });
  assert.equal(allowedDuplicate.status, 201);
  const duplicateSaved = await json(allowedDuplicate);

  const { applications } = await json(await request("/applications"));
  assert.ok(applications.some((application) => application.id === saved.application.id));
  assert.ok(applications.some((application) => application.id === duplicateSaved.application.id));

  const refreshResponse = await request("/auth/extension/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  const refreshed = await json(refreshResponse);
  assert.notEqual(refreshed.refreshToken, session.refreshToken);
  accessToken = refreshed.accessToken;

  console.log(JSON.stringify({
    status: "passed",
    checks: [
      "extension CORS",
      "extension login",
      "draft creation",
      "idempotent replay",
      "draft restore",
      "application save",
      "duplicate warning",
      "duplicate override",
      "application visibility",
      "session refresh",
    ],
  }, null, 2));
} finally {
  if (accountCreated && accessToken) {
    const cleanupResponse = await request("/auth/account", {
      method: "DELETE",
      body: JSON.stringify({ password }),
    }).catch(() => undefined);
    if (cleanupResponse && cleanupResponse.status !== 204) {
      console.error(`Disposable account cleanup failed with HTTP ${cleanupResponse.status}`);
    }
  }
}
