import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { afterEach } from "node:test";

import { createApp } from "../app.js";
import { env } from "../config/env.js";
import { setPrismaForTests } from "../db/prisma.js";
import { setResumeStorageForTests } from "../services/resume-storage.services.js";
import { RESUME_ERROR_CODES } from "../services/resumes.services.js";

const USER_ONE = "user-one";
const USER_TWO = "user-two";

function accessToken(userId) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, email: `${userId}@example.com`, exp: Math.floor(Date.now() / 1000) + 300 }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", env.JWT_ACCESS_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function matchesWhere(row, where = {}) {
  for (const [field, expected] of Object.entries(where)) {
    const actual = row[field];
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if (Object.prototype.hasOwnProperty.call(expected, "in") && !expected.in.includes(actual)) return false;
      if (Object.prototype.hasOwnProperty.call(expected, "not") && actual === expected.not) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

function createPrismaFake() {
  const resumes = [];

  const resumeVersion = {
    async count({ where }) {
      return resumes.filter((row) => matchesWhere(row, where)).length;
    },
    async findMany({ where }) {
      return resumes.filter((row) => matchesWhere(row, where));
    },
    async findFirst({ where }) {
      return resumes.find((row) => matchesWhere(row, where)) ?? null;
    },
    async create({ data }) {
      if (data.checksum && resumes.some((row) => row.userId === data.userId && row.checksum === data.checksum)) {
        const error = new Error("unique constraint");
        error.code = "P2002";
        throw error;
      }
      const now = new Date();
      const row = { archivedAt: null, extractedText: null, createdAt: now, updatedAt: now, ...data };
      resumes.push(row);
      return row;
    },
    async updateMany({ where, data }) {
      const matching = resumes.filter((row) => matchesWhere(row, where));
      for (const row of matching) {
        if (
          data.checksum &&
          resumes.some(
            (candidate) => candidate !== row && candidate.userId === row.userId && candidate.checksum === data.checksum,
          )
        ) {
          const error = new Error("unique constraint");
          error.code = "P2002";
          throw error;
        }
        Object.assign(row, data, { updatedAt: new Date() });
      }
      return { count: matching.length };
    },
    async deleteMany({ where }) {
      let count = 0;
      for (let index = resumes.length - 1; index >= 0; index -= 1) {
        if (matchesWhere(resumes[index], where)) {
          resumes.splice(index, 1);
          count += 1;
        }
      }
      return { count };
    },
  };

  const prisma = {
    resumeVersion,
    async $queryRaw() {
      return [];
    },
    async $transaction(operation) {
      return operation(prisma);
    },
  };

  function seedResume(overrides = {}) {
    const now = new Date();
    const id = overrides.id ?? `resume-${resumes.length + 1}`;
    const row = {
      id,
      userId: USER_ONE,
      name: "Primary resume",
      targetRole: null,
      storageKey: `resumes/test/${id}.pdf`,
      originalFilename: "resume.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      checksum: null,
      uploadStatus: "READY",
      extractedText: null,
      notes: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      _count: { applications: 0 },
      ...overrides,
    };
    resumes.push(row);
    return row;
  }

  return { prisma, resumes, seedResume };
}

function createStorageFake() {
  const objects = new Map();
  const calls = [];
  const controls = { deleteError: null };

  return {
    objects,
    calls,
    controls,
    put(key, { bytes, contentType = "application/pdf", sizeBytes, checksumSha256 = null }) {
      const body = Buffer.from(bytes);
      objects.set(key, { body, contentType, sizeBytes: sizeBytes ?? body.length, checksumSha256 });
    },
    async presignUpload({ key, contentType, expiresInSeconds }) {
      calls.push(["presignUpload", key, contentType, expiresInSeconds]);
      return `https://storage.test/upload/${encodeURIComponent(key)}`;
    },
    async presignDownload({ key, downloadFilename, expiresInSeconds }) {
      calls.push(["presignDownload", key, downloadFilename, expiresInSeconds]);
      return `https://storage.test/download/${encodeURIComponent(key)}`;
    },
    async inspectObject(key) {
      calls.push(["inspectObject", key]);
      const object = objects.get(key);
      if (!object) return null;
      return {
        sizeBytes: object.sizeBytes,
        contentType: object.contentType,
        checksumSha256: object.checksumSha256,
      };
    },
    async readObjectRange(key, { start, end }) {
      calls.push(["readObjectRange", key, start, end]);
      const object = objects.get(key);
      if (!object) throw new Error("missing");
      return object.body.subarray(start, end + 1);
    },
    async deleteObject(key) {
      calls.push(["deleteObject", key]);
      if (controls.deleteError) throw controls.deleteError;
      objects.delete(key);
    },
  };
}

async function withApi(prisma, storage, run) {
  setPrismaForTests(prisma);
  setResumeStorageForTests(storage);
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function jsonRequest(userId, body, method = "POST") {
  return {
    method,
    headers: {
      authorization: `Bearer ${accessToken(userId)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function uploadPayload(overrides = {}) {
  return {
    name: "Product resume",
    targetRole: "Product Manager",
    originalFilename: "product-resume.pdf",
    mimeType: "application/pdf",
    sizeBytes: 13,
    checksum: "a".repeat(64),
    notes: "Tailored resume",
    ...overrides,
  };
}

afterEach(() => {
  setPrismaForTests(null);
  setResumeStorageForTests(null);
});

test("authenticated resume upload completes, lists, and produces a download URL", async () => {
  const db = createPrismaFake();
  const storage = createStorageFake();

  await withApi(db.prisma, storage, async (baseUrl) => {
    const missingAuth = await fetch(`${baseUrl}/resumes/uploads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(uploadPayload()),
    });
    assert.equal(missingAuth.status, 401);

    const initiationResponse = await fetch(
      `${baseUrl}/resumes/uploads`,
      jsonRequest(USER_ONE, uploadPayload()),
    );
    assert.equal(initiationResponse.status, 201);
    const initiated = await initiationResponse.json();
    assert.equal(initiated.resume.uploadStatus, "PENDING");
    assert.equal(initiated.resume.storageKey, undefined);
    assert.equal(initiated.requiredHeaders["Content-Type"], "application/pdf");
    assert.equal(initiated.expiresInSeconds, 300);
    assert.match(initiated.objectKey, /^users\/user-one\/resumes\/[a-f0-9-]+\/[a-f0-9]+\.pdf$/);

    const bytes = Buffer.from("%PDF-fixture\n");
    assert.equal(bytes.length, uploadPayload().sizeBytes);
    storage.put(initiated.objectKey, { bytes });

    const completedResponse = await fetch(
      `${baseUrl}/resumes/${initiated.resume.id}/complete`,
      jsonRequest(USER_ONE, {}),
    );
    assert.equal(completedResponse.status, 200);
    const completed = await completedResponse.json();
    assert.equal(completed.resume.uploadStatus, "READY");

    const listResponse = await fetch(`${baseUrl}/resumes`, {
      headers: { authorization: `Bearer ${accessToken(USER_ONE)}` },
    });
    assert.equal(listResponse.status, 200);
    assert.deepEqual((await listResponse.json()).resumes.map((resume) => resume.id), [initiated.resume.id]);

    const downloadResponse = await fetch(`${baseUrl}/resumes/${initiated.resume.id}/download-url`, {
      headers: { authorization: `Bearer ${accessToken(USER_ONE)}` },
    });
    assert.equal(downloadResponse.status, 200);
    const download = await downloadResponse.json();
    assert.match(download.downloadUrl, /^https:\/\/storage\.test\/download\//);

    const repeated = await fetch(
      `${baseUrl}/resumes/${initiated.resume.id}/complete`,
      jsonRequest(USER_ONE, {}),
    );
    assert.equal(repeated.status, 409);
    assert.equal((await repeated.json()).code, RESUME_ERROR_CODES.INVALID_STATE);
  });
});

test("completion removes invalid PDF, oversized, and missing uploads", async () => {
  const db = createPrismaFake();
  const storage = createStorageFake();

  await withApi(db.prisma, storage, async (baseUrl) => {
    const cases = [
      {
        payload: uploadPayload({ checksum: "b".repeat(64), sizeBytes: 10 }),
        object: { bytes: "not-a-pdf", sizeBytes: 10 },
        status: 422,
        code: RESUME_ERROR_CODES.INVALID_UPLOAD,
      },
      {
        payload: uploadPayload({ checksum: "c".repeat(64), sizeBytes: 10 }),
        object: { bytes: "%PDF-data", sizeBytes: env.RESUME_UPLOAD_MAX_BYTES + 1 },
        status: 413,
        code: RESUME_ERROR_CODES.TOO_LARGE,
      },
      {
        payload: uploadPayload({ checksum: "d".repeat(64), sizeBytes: 10 }),
        object: null,
        status: 404,
        code: RESUME_ERROR_CODES.UPLOAD_MISSING,
      },
    ];

    for (const scenario of cases) {
      const initiationResponse = await fetch(
        `${baseUrl}/resumes/uploads`,
        jsonRequest(USER_ONE, scenario.payload),
      );
      const initiation = await initiationResponse.json();
      if (scenario.object) storage.put(initiation.objectKey, scenario.object);

      const completionResponse = await fetch(
        `${baseUrl}/resumes/${initiation.resume.id}/complete`,
        jsonRequest(USER_ONE, {}),
      );
      assert.equal(completionResponse.status, scenario.status);
      assert.equal((await completionResponse.json()).code, scenario.code);
      assert.equal(db.resumes.some((resume) => resume.id === initiation.resume.id), false);
      assert.equal(storage.objects.has(initiation.objectKey), false);
    }
  });
});

test("transient storage errors preserve pending uploads for retry", async () => {
  const db = createPrismaFake();
  const storage = createStorageFake();
  const pending = db.seedResume({ id: "retryable", uploadStatus: "PENDING", sizeBytes: 13 });
  storage.put(pending.storageKey, { bytes: "%PDF-fixture\n" });
  storage.inspectObject = async (key) => {
    storage.calls.push(["inspectObject", key]);
    throw new Error("temporary storage outage");
  };

  await withApi(db.prisma, storage, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/resumes/${pending.id}/complete`,
      jsonRequest(USER_ONE, {}),
    );
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, RESUME_ERROR_CODES.STORAGE_UNAVAILABLE);
    assert.equal(db.resumes[0].uploadStatus, "PENDING");
    assert.equal(storage.objects.has(pending.storageKey), true);
  });
});

test("failed object cleanup leaves a hidden FAILED record for later recovery", async () => {
  const db = createPrismaFake();
  const storage = createStorageFake();
  const pending = db.seedResume({
    id: "cleanup-retry",
    uploadStatus: "PENDING",
    sizeBytes: 10,
    checksum: "9".repeat(64),
  });
  storage.put(pending.storageKey, { bytes: "not-a-pdf", sizeBytes: 10 });
  storage.deleteObject = async (key) => {
    storage.calls.push(["deleteObject", key]);
    throw new Error("temporary delete failure");
  };

  await withApi(db.prisma, storage, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/resumes/${pending.id}/complete`,
      jsonRequest(USER_ONE, {}),
    );
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, RESUME_ERROR_CODES.INVALID_UPLOAD);
    assert.equal(db.resumes[0].uploadStatus, "FAILED");
    assert.equal(db.resumes[0].checksum, null);

    const listed = await fetch(`${baseUrl}/resumes?includeArchived=true`, {
      headers: { authorization: `Bearer ${accessToken(USER_ONE)}` },
    });
    assert.deepEqual((await listed.json()).resumes, []);
  });
});

test("upload initiation normalizes invalid type and declared-size errors", async () => {
  const db = createPrismaFake();
  const storage = createStorageFake();

  await withApi(db.prisma, storage, async (baseUrl) => {
    const invalidType = await fetch(
      `${baseUrl}/resumes/uploads`,
      jsonRequest(USER_ONE, uploadPayload({ originalFilename: "resume.docx", mimeType: "application/msword" })),
    );
    assert.equal(invalidType.status, 400);
    assert.equal((await invalidType.json()).code, RESUME_ERROR_CODES.INVALID_TYPE);

    const oversized = await fetch(
      `${baseUrl}/resumes/uploads`,
      jsonRequest(USER_ONE, uploadPayload({ sizeBytes: env.RESUME_UPLOAD_MAX_BYTES + 1 })),
    );
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).code, RESUME_ERROR_CODES.TOO_LARGE);
    assert.equal(db.resumes.length, 0);
    assert.equal(storage.calls.length, 0);
  });
});

test("quota and duplicate checks reject upload initiation with stable errors", async () => {
  const quotaDb = createPrismaFake();
  const storage = createStorageFake();
  for (let index = 0; index < env.RESUME_ACTIVE_LIMIT; index += 1) {
    quotaDb.seedResume({ id: `active-${index}`, checksum: `f${String(index).padStart(63, "0")}` });
  }

  await withApi(quotaDb.prisma, storage, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/resumes/uploads`,
      jsonRequest(USER_ONE, uploadPayload({ checksum: "e".repeat(64) })),
    );
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, RESUME_ERROR_CODES.QUOTA_EXCEEDED);
    assert.equal(storage.calls.length, 0);
  });

  const duplicateDb = createPrismaFake();
  duplicateDb.seedResume({ checksum: "e".repeat(64) });
  await withApi(duplicateDb.prisma, storage, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/resumes/uploads`,
      jsonRequest(USER_ONE, uploadPayload({ checksum: "e".repeat(64) })),
    );
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, RESUME_ERROR_CODES.DUPLICATE);
  });
});

test("default lists exclude pending, failed, and archived records", async () => {
  const db = createPrismaFake();
  const storage = createStorageFake();
  db.seedResume({ id: "ready" });
  db.seedResume({ id: "pending", uploadStatus: "PENDING" });
  db.seedResume({ id: "failed", uploadStatus: "FAILED" });
  db.seedResume({ id: "archived", archivedAt: new Date("2026-09-01T00:00:00.000Z") });
  db.seedResume({ id: "foreign", userId: USER_TWO });

  await withApi(db.prisma, storage, async (baseUrl) => {
    const headers = { authorization: `Bearer ${accessToken(USER_ONE)}` };
    const defaultResponse = await fetch(`${baseUrl}/resumes`, { headers });
    assert.deepEqual((await defaultResponse.json()).resumes.map((resume) => resume.id), ["ready"]);

    const archivedResponse = await fetch(`${baseUrl}/resumes?includeArchived=true`, { headers });
    assert.deepEqual(
      (await archivedResponse.json()).resumes.map((resume) => resume.id).sort(),
      ["archived", "ready"],
    );
  });
});

test("cross-user completion, download, and update never reach storage", async () => {
  const db = createPrismaFake();
  const storage = createStorageFake();
  const ready = db.seedResume({ id: "private-ready" });
  const pending = db.seedResume({ id: "private-pending", uploadStatus: "PENDING" });
  storage.put(ready.storageKey, { bytes: "%PDF-data\n", sizeBytes: ready.sizeBytes });
  storage.put(pending.storageKey, { bytes: "%PDF-data\n", sizeBytes: pending.sizeBytes });

  await withApi(db.prisma, storage, async (baseUrl) => {
    const requests = [
      fetch(`${baseUrl}/resumes/${ready.id}/download-url`, {
        headers: { authorization: `Bearer ${accessToken(USER_TWO)}` },
      }),
      fetch(`${baseUrl}/resumes/${pending.id}/complete`, jsonRequest(USER_TWO, {})),
      fetch(`${baseUrl}/resumes/${ready.id}`, jsonRequest(USER_TWO, { name: "Stolen" }, "PATCH")),
    ];

    const responses = await Promise.all(requests);
    for (const response of responses) {
      assert.equal(response.status, 404);
      assert.equal((await response.json()).code, RESUME_ERROR_CODES.ACCESS_DENIED);
    }
    assert.equal(storage.calls.length, 0);
    assert.equal(db.resumes.length, 2);
  });
});

test("metadata updates archive and unarchive without accepting file replacement", async () => {
  const db = createPrismaFake();
  const storage = createStorageFake();
  const resume = db.seedResume({ id: "editable" });

  await withApi(db.prisma, storage, async (baseUrl) => {
    const rejected = await fetch(
      `${baseUrl}/resumes/${resume.id}`,
      jsonRequest(USER_ONE, { storageKey: "replacement.pdf" }, "PATCH"),
    );
    assert.equal(rejected.status, 400);

    const archived = await fetch(
      `${baseUrl}/resumes/${resume.id}`,
      jsonRequest(USER_ONE, { name: "Updated", notes: "New notes", archived: true }, "PATCH"),
    );
    assert.equal(archived.status, 200);
    const archivedBody = await archived.json();
    assert.equal(archivedBody.resume.name, "Updated");
    assert.ok(archivedBody.resume.archivedAt);
    assert.equal(db.resumes[0].storageKey, resume.storageKey);

    const hidden = await fetch(`${baseUrl}/resumes`, {
      headers: { authorization: `Bearer ${accessToken(USER_ONE)}` },
    });
    assert.deepEqual((await hidden.json()).resumes, []);

    const unarchived = await fetch(
      `${baseUrl}/resumes/${resume.id}`,
      jsonRequest(USER_ONE, { archived: false }, "PATCH"),
    );
    assert.equal(unarchived.status, 200);
    assert.equal((await unarchived.json()).resume.archivedAt, null);
  });
});

test("permanent deletion rejects referenced resumes and retries storage failures safely", async () => {
  const db = createPrismaFake();
  const storage = createStorageFake();
  const deletable = db.seedResume({ id: "deletable" });
  const referenced = db.seedResume({
    id: "referenced",
    _count: { applications: 2 },
  });
  storage.put(deletable.storageKey, { bytes: "%PDF-data\n" });
  storage.put(referenced.storageKey, { bytes: "%PDF-data\n" });

  await withApi(db.prisma, storage, async (baseUrl) => {
    const referencedResponse = await fetch(
      `${baseUrl}/resumes/${referenced.id}`,
      jsonRequest(USER_ONE, {}, "DELETE"),
    );
    assert.equal(referencedResponse.status, 409);
    assert.equal((await referencedResponse.json()).code, RESUME_ERROR_CODES.IN_USE);
    assert.equal(storage.objects.has(referenced.storageKey), true);

    storage.controls.deleteError = new Error("temporary outage");
    const failedResponse = await fetch(
      `${baseUrl}/resumes/${deletable.id}`,
      jsonRequest(USER_ONE, {}, "DELETE"),
    );
    assert.equal(failedResponse.status, 503);
    assert.equal((await failedResponse.json()).code, RESUME_ERROR_CODES.STORAGE_UNAVAILABLE);
    assert.equal(db.resumes.some((resume) => resume.id === deletable.id), true);

    storage.controls.deleteError = null;
    const deletedResponse = await fetch(
      `${baseUrl}/resumes/${deletable.id}`,
      jsonRequest(USER_ONE, {}, "DELETE"),
    );
    assert.equal(deletedResponse.status, 204);
    assert.equal(db.resumes.some((resume) => resume.id === deletable.id), false);
    assert.equal(storage.objects.has(deletable.storageKey), false);

    const foreignResponse = await fetch(
      `${baseUrl}/resumes/${referenced.id}`,
      jsonRequest(USER_TWO, {}, "DELETE"),
    );
    assert.equal(foreignResponse.status, 404);
  });
});
