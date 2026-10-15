import assert from "node:assert/strict";
import test from "node:test";

const localValues = {};
globalThis.chrome = {
  storage: {
    local: {
      get: async (key) => Object.hasOwn(localValues, key) ? { [key]: localValues[key] } : {},
      set: async (entries) => Object.assign(localValues, entries),
      remove: async (key) => { delete localValues[key]; },
    },
  },
};

const { createDraft, login, readSession, refresh, logout, storeSession, saveDraft, listResumes } = await import("../dist/development/api.js");

test("extension login persists its own refreshable session", async () => {
  const session = {
    accessToken: "access-1",
    refreshToken: "refresh-1",
    refreshTokenExpiresAt: "2026-09-17T00:00:00.000Z",
    user: { id: "user-1", name: "Taylor", email: "taylor@example.com" },
  };
  globalThis.fetch = async (url, init) => {
    assert.match(url, /\/auth\/extension\/login$/);
    assert.equal(url, "http://localhost:4000/auth/extension/login");
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "error");
    assert.ok(init.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(init.body), { email: "Taylor@Example.com", password: "password123" });
    return Response.json(session);
  };
  assert.deepEqual(await login("Taylor@Example.com", "password123"), session);
  assert.deepEqual(await readSession(), session);
});

test("draft requests refresh an expired access token and retain the capture id", async () => {
  const calls = [];
  const refreshed = {
    accessToken: "access-2",
    refreshToken: "refresh-2",
    refreshTokenExpiresAt: "2026-09-17T00:00:00.000Z",
    user: { id: "user-1", name: "Taylor", email: "taylor@example.com" },
  };
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) return Response.json({ message: "expired" }, { status: 401 });
    if (calls.length === 2) return Response.json(refreshed);
    return Response.json({ importDraft: { id: "draft-1" }, duplicateCandidates: [] }, { status: 201 });
  };
  const captureId = "123e4567-e89b-42d3-a456-426614174000";
  const response = await createDraft(await readSession(), {
    version: 1,
    captureId,
    createdAt: Date.now(),
    sourceUrl: "https://jobs.example.com/7",
    sourceDomain: "jobs.example.com",
    pageTitle: "Engineer",
    rawText: "Description",
    warnings: [],
  });
  assert.equal(calls.length, 3);
  assert.match(calls[1].url, /\/auth\/extension\/refresh$/);
  assert.equal(calls[2].init.headers["Idempotency-Key"], captureId);
  assert.equal(calls[2].init.headers.authorization, "Bearer access-2");
  assert.equal(response.result.importDraft.id, "draft-1");
  assert.equal((await readSession()).refreshToken, "refresh-2");
});

test("network and provider failures preserve the saved managed session", async () => {
  const session = await readSession();
  globalThis.fetch = async () => { throw new TypeError("offline"); };
  await assert.rejects(refresh(session));
  assert.deepEqual(await readSession(), session);
  await assert.rejects(logout(session));
  assert.deepEqual(await readSession(), session);
  globalThis.fetch = async () => Response.json({ message: "temporarily unavailable" }, { status: 503 });
  await assert.rejects(refresh(session));
  assert.deepEqual(await readSession(), session);
});

test("production never reads or transmits a development or unscoped session", async () => {
  const developmentSession = await readSession();
  localValues["jobhazel.extension-session.v1"] = developmentSession;
  const production = await import("../dist/production/api.js");
  assert.equal(await production.readSession(), null);
  assert.equal(localValues["jobhazel.extension-session.v1"], undefined);
  assert.deepEqual(await readSession(), developmentSession);
  const productionSession = { ...developmentSession, accessToken: "production-access", refreshToken: "production-refresh" };
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.jobhazel.com/auth/extension/login");
    assert.equal(init.credentials, "omit");
    return Response.json(productionSession);
  };
  await production.login("taylor@example.com", "password123");
  assert.deepEqual(await production.readSession(), productionSession);
  assert.deepEqual(await readSession(), developmentSession);
  await storeSession(null);
  assert.equal(await readSession(), null);
  assert.deepEqual(await production.readSession(), productionSession);
});

test("invalid and non-JSON auth responses cannot overwrite a saved session", async () => {
  const production = await import("../dist/production/api.js");
  const session = await production.readSession();
  for (const body of [null, {}, { accessToken: "access", refreshToken: "refresh", user: { email: "test@example.com" } }]) {
    globalThis.fetch = async () => Response.json(body);
    await assert.rejects(production.login("test@example.com", "password123"));
    assert.deepEqual(await production.readSession(), session);
  }
  globalThis.fetch = async () => new Response("<html>upstream error</html>", { headers: { "Content-Type": "text/html" } });
  await assert.rejects(production.refresh(session));
  assert.deepEqual(await production.readSession(), session);
});

test("resume library uses authenticated requests and excludes archived or incomplete uploads", async () => {
  const session = { accessToken: "resume-access" };
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "http://localhost:4000/resumes");
    assert.equal(init.headers.authorization, "Bearer resume-access");
    return Response.json({ resumes: [
      { id: "ready", name: "Engineering resume", uploadStatus: "READY", archivedAt: null },
      { id: "pending", uploadStatus: "PENDING", archivedAt: null },
      { id: "archived", uploadStatus: "READY", archivedAt: "2025-01-01" },
    ] });
  };
  assert.deepEqual((await listResumes(session)).resumes.map((resume) => resume.id), ["ready"]);
});

test("saving an import sends the selected resume or an explicit no-resume value", async () => {
  for (const selected of ["ready", ""]) {
    globalThis.fetch = async (url, init) => {
      assert.match(url, /\/imports\/draft-1\/convert$/);
      assert.equal(init.headers.authorization, "Bearer resume-access");
      const body = JSON.parse(init.body);
      assert.equal(body.resumeVersionId, selected || null);
      return Response.json({ application: { id: "app-1", title: "Engineer", resumeVersionId: body.resumeVersionId } });
    };
    await saveDraft({ accessToken: "resume-access" }, "draft-1", {
      title: "Engineer", companyName: "Acme", status: "APPLIED", source: "", sourceUrl: "", location: "",
      salaryMin: "", salaryMax: "", description: "", notes: "", dateApplied: "", allowDuplicate: false,
      resumeVersionId: selected,
    });
  }
});
