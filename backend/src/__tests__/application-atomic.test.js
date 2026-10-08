import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createApplication, updateApplication } from "../services/applications.services.js";
import { setPrismaForTests } from "../db/prisma.js";
import { validateApplicationPayload } from "../validators/application.validators.js";

afterEach(() => setPrismaForTests(null));
const payload = { title: "Engineer", status: "SAVED", companyName: "Example" };

function fixture() {
  let state = { applications: [], companies: [], logs: [] };
  const resumes = [
    { id: "ready", userId: "u", name: "Ready", uploadStatus: "READY", archivedAt: null },
    { id: "foreign", userId: "other", name: "Foreign", uploadStatus: "READY" },
    { id: "pending", userId: "u", uploadStatus: "PENDING" },
    { id: "archived", userId: "u", name: "Archived", uploadStatus: "READY", archivedAt: new Date() },
  ];
  let failHistory = false;
  let inside = false;
  const hydrate = (row) => row && ({ ...row, company: state.companies.find(c => c.id === row.companyId), resumeVersion: resumes.find(r => r.id === row.resumeVersionId) ?? null });
  const matches = (row, where) => Object.entries(where).every(([k, v]) => row[k] === v);
  const prisma = {
    $queryRaw: async () => { assert.ok(inside, "locks belong to the save transaction"); return []; },
    resumeVersion: { findFirst: async ({ where }) => { assert.ok(inside); return resumes.find(r => matches(r, where)) ?? null; } },
    company: { upsert: async ({ create }) => { assert.ok(inside); const row = { id: "co", ...create }; state.companies.push(row); return row; } },
    application: {
      findMany: async () => [],
      findFirst: async ({ where }) => hydrate(state.applications.find(a => matches(a, where))),
      create: async ({ data }) => { assert.ok(inside); const row = { id: "app", ...data }; state.applications.push(row); return hydrate(row); },
      update: async ({ where, data }) => { assert.ok(inside); const row = state.applications.find(a => matches(a, where)); Object.assign(row, data); return hydrate(row); },
    },
    activityLog: { create: async ({ data }) => { assert.ok(inside); if (failHistory && data.type.startsWith("RESUME_")) throw Error("history unavailable"); state.logs.push(data); } },
    user: { findUnique: async () => ({ autoCreateFollowUpTasks: false }) },
    $transaction: async (fn) => {
      const before = structuredClone(state); inside = true;
      try { return await fn(prisma); } catch (e) { state = before; throw e; } finally { inside = false; }
    },
  };
  setPrismaForTests(prisma);
  return { get state() { return state; }, set failHistory(value) { failHistory = value; } };
}

test("create includes resume and history, and failed resume history rolls back the application and company", async () => {
  const f = fixture();
  f.failHistory = true;
  await assert.rejects(createApplication("u", { ...payload, resumeVersionId: "ready" }), /history unavailable/);
  assert.deepEqual(f.state, { applications: [], companies: [], logs: [] });
  f.failHistory = false;
  const result = await createApplication("u", { ...payload, resumeVersionId: "ready" });
  assert.equal(result.application.resumeVersion.id, "ready");
  assert.deepEqual(f.state.logs.map(l => l.type), ["APPLICATION_CREATED", "RESUME_ATTACHED"]);
});

test("invalid resume saves never commit application, company or activity mutations", async () => {
  for (const [id, code] of [["foreign", "ACCESS_DENIED"], ["missing", "ACCESS_DENIED"], ["pending", "INVALID_STATE"], ["archived", "ARCHIVED"]]) {
    const f = fixture();
    await assert.rejects(createApplication("u", { ...payload, resumeVersionId: id }), { code: `APPLICATION_RESUME_${code}` });
    assert.equal(f.state.applications.length, 0);
    await createApplication("u", payload);
    const before = structuredClone(f.state);
    await assert.rejects(updateApplication("u", "app", { ...payload, title: "Changed", resumeVersionId: id }), { code: `APPLICATION_RESUME_${code}` });
    assert.deepEqual(f.state, before);
  }
});

test("update preserves omitted association, permits historical archived selection, and removes explicitly", async () => {
  const f = fixture();
  await createApplication("u", { ...payload, resumeVersionId: "ready" });
  await updateApplication("u", "app", { ...payload, title: "New" });
  assert.equal(f.state.applications[0].resumeVersionId, "ready");
  f.state.applications[0].resumeVersionId = "archived";
  await updateApplication("u", "app", { ...payload, resumeVersionId: "archived" });
  assert.equal(f.state.logs.filter(l => l.type.startsWith("RESUME_")).length, 1);
  f.failHistory = true;
  const before = structuredClone(f.state);
  await assert.rejects(updateApplication("u", "app", { ...payload, title: "Changed", resumeVersionId: null }), /history unavailable/);
  assert.deepEqual(f.state, before);
  f.failHistory = false;
  await updateApplication("u", "app", { ...payload, resumeVersionId: null });
  assert.equal(f.state.applications[0].resumeVersionId, null);
  assert.equal(f.state.logs.at(-1).type, "RESUME_REMOVED");
});

test("save validator distinguishes omitted, null and malformed resume identifiers", () => {
  for (const value of [undefined, null, " ready ", "", 123, {}, []]) {
    const req = { body: { title: "Engineer", ...(value === undefined ? {} : { resumeVersionId: value }) } };
    let status;
    let next = false;
    const res = { status(code) { status = code; return this; }, json() {} };
    validateApplicationPayload(req, res, () => { next = true; });
    if (value === undefined) assert.equal(Object.hasOwn(req.validatedApplication, "resumeVersionId"), false);
    else if (value === null || typeof value === "string" && value.trim()) assert.equal(req.validatedApplication.resumeVersionId, value?.trim() ?? null);
    else { assert.equal(status, 400); assert.equal(next, false); }
  }
});
