import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { setPrismaForTests } from "../db/prisma.js";
import { convertImportDraft } from "../services/imports.services.js";
import { validateConvertDraftPayload } from "../validators/import.validators.js";

afterEach(() => setPrismaForTests(null));

function fixture() {
  let state = { draft: { id: "draft", userId: "user", convertedAt: null, parsedTitle: "Engineer", parsedCompany: "Acme", sourceUrl: "https://jobs.example.com/role" }, applications: [], companies: [], activity: [], resumes: [
    { id: "resume-ready", userId: "user", name: "Engineering resume", targetRole: "Engineer", originalFilename: "engineering.pdf", uploadStatus: "READY", archivedAt: null, storageKey: "private-file" },
    { id: "resume-foreign", userId: "other-user", uploadStatus: "READY" },
    { id: "resume-pending", userId: "user", uploadStatus: "PENDING" },
    { id: "resume-archived", userId: "user", uploadStatus: "READY", archivedAt: new Date() },
  ] };
  let queue = Promise.resolve();
  let failActivity = false;
  const prisma = {
    resumeVersion: { findFirst: async ({ where }) => state.resumes.find((resume) => resume.id === where.id && resume.userId === where.userId) ?? null },
    importDraft: {
      findFirst: async ({ where }) => where.id === state.draft.id && where.userId === state.draft.userId ? structuredClone(state.draft) : null,
      updateMany: async ({ where, data }) => {
        if (where.id !== state.draft.id || where.userId !== state.draft.userId || where.convertedAt !== state.draft.convertedAt) return { count: 0 };
        Object.assign(state.draft, data);
        return { count: 1 };
      },
    },
    application: {
      findMany: async () => structuredClone(state.applications),
      create: async ({ data }) => {
        const value = { id: `application-${state.applications.length + 1}`, ...data };
        state.applications.push(value);
        return structuredClone({ ...value, resumeVersion: state.resumes.find((resume) => resume.id === value.resumeVersionId) ?? null });
      },
    },
    company: { upsert: async ({ create }) => {
      const value = { id: "company", ...create };
      state.companies.push(value);
      return value;
    } },
    activityLog: { create: async ({ data }) => {
      if (failActivity) throw new Error("injected activity failure");
      state.activity.push(data);
      return data;
    } },
    $transaction(callback) {
      const run = queue.then(async () => {
        const before = structuredClone(state);
        try { return await callback(prisma); }
        catch (error) { state = before; throw error; }
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
  setPrismaForTests(prisma);
  return { get state() { return state; }, failActivity(value) { failActivity = value; } };
}

test("concurrent draft conversion produces one application and one activity even with duplicate override", async () => {
  const db = fixture();
  const results = await Promise.all(Array.from({ length: 4 }, () => convertImportDraft("user", "draft", { status: "SAVED", allowDuplicate: true })));
  assert.equal(results.filter((value) => value.application).length, 1);
  assert.equal(results.filter((value) => value.alreadyConverted).length, 3);
  assert.equal(db.state.applications.length, 1);
  assert.equal(db.state.companies.length, 1);
  assert.equal(db.state.activity.length, 1);
  assert.ok(db.state.draft.convertedAt);
  assert.equal((await convertImportDraft("user", "draft", { allowDuplicate: true })).alreadyConverted, true);
});

test("a failed conversion rolls back the claim and all side effects, then can be retried", async () => {
  const db = fixture();
  db.failActivity(true);
  await assert.rejects(convertImportDraft("user", "draft", { status: "SAVED" }), /injected activity failure/);
  assert.equal(db.state.draft.convertedAt, null);
  assert.deepEqual(db.state.applications, []);
  assert.deepEqual(db.state.companies, []);
  assert.deepEqual(db.state.activity, []);
  db.failActivity(false);
  assert.ok((await convertImportDraft("user", "draft", { status: "SAVED" })).application);
  assert.equal(db.state.applications.length, 1);
});

test("another account cannot claim or convert a draft", async () => {
  const db = fixture();
  assert.equal(await convertImportDraft("other-user", "draft", { status: "SAVED" }), null);
  assert.equal(db.state.draft.convertedAt, null);
  assert.deepEqual(db.state.applications, []);
});

test("import conversion attaches the selected resume and logs it atomically", async () => {
  const db = fixture();
  const result = await convertImportDraft("user", "draft", { status: "SAVED", resumeVersionId: "resume-ready" });
  assert.equal(result.application.resumeVersionId, "resume-ready");
  assert.equal(result.application.resumeVersion.name, "Engineering resume");
  assert.equal(result.application.resumeVersion.storageKey, undefined);
  assert.deepEqual(db.state.activity.map((event) => event.type), ["IMPORT_CONVERTED", "RESUME_ATTACHED"]);
  assert.equal(db.state.activity[1].metadata.nextResumeVersionId, "resume-ready");
  assert.equal((await convertImportDraft("user", "draft", { resumeVersionId: "resume-ready" })).alreadyConverted, true);
  assert.equal(db.state.applications.length, 1);
});

for (const [id, status] of [["resume-foreign", 404], ["missing", 404], ["resume-pending", 409], ["resume-archived", 409]]) {
  test(`invalid import resume ${id} rolls back the draft and can be corrected`, async () => {
    const db = fixture();
    await assert.rejects(convertImportDraft("user", "draft", { status: "SAVED", resumeVersionId: id }), (error) => error.status === status);
    assert.equal(db.state.draft.convertedAt, null);
    assert.deepEqual(db.state.applications, []);
    assert.deepEqual(db.state.activity, []);
    const result = await convertImportDraft("user", "draft", { status: "SAVED", resumeVersionId: "resume-ready" });
    assert.equal(result.application.resumeVersionId, "resume-ready");
  });
}

test("conversion without a resume remains optional", async () => {
  const db = fixture();
  const result = await convertImportDraft("user", "draft", { status: "SAVED", resumeVersionId: null });
  assert.equal(result.application.resumeVersionId, null);
  assert.equal(result.application.resumeVersion, null);
  assert.equal(db.state.activity.length, 1);
});

test("conversion validator preserves selected resumes, normalizes blanks, and rejects malformed IDs", () => {
  for (const [value, expected] of [["resume-ready", "resume-ready"], ["", null], [null, null], [undefined, null], [{ id: "resume-ready" }, undefined], [7, undefined], ["a".repeat(201), undefined]]) {
    const req = { body: { resumeVersionId: value } };
    let status;
    const res = { status(value) { status = value; return this; }, json() {} };
    let called = false;
    validateConvertDraftPayload(req, res, () => { called = true; });
    assert.equal(called, expected !== undefined);
    if (called) assert.equal(req.validatedImportConversion.resumeVersionId, expected);
    else assert.equal(status, 400);
  }
});
