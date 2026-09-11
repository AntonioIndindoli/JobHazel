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

const { createDraft, login, readSession } = await import("../dist/development/api.js");

test("extension login persists its own refreshable session", async () => {
  const session = {
    accessToken: "access-1",
    refreshToken: "refresh-1",
    refreshTokenExpiresAt: "2026-09-17T00:00:00.000Z",
    user: { id: "user-1", name: "Taylor", email: "taylor@example.com" },
  };
  globalThis.fetch = async (url, init) => {
    assert.match(url, /\/auth\/extension\/login$/);
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
