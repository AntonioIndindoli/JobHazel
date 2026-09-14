import assert from "node:assert/strict";
import { accessToken, mockManagedAuth } from "./helpers/managed-auth.js";
import test, { afterEach } from "node:test";

import { createApp } from "../app.js";
import { env } from "../config/env.js";
import { setPrismaForTests } from "../db/prisma.js";
import { APPLICATION_RESUME_ERROR_CODES } from "../services/applications.services.js";

const USER_ONE = "user-one";
const USER_TWO = "user-two";


function matchesWhere(row, where = {}) {
  return Object.entries(where).every(([field, expected]) => row[field] === expected);
}

function createPrismaFake() {
  const now = new Date("2026-09-09T12:00:00.000Z");
  const applications = [
    {
      id: "app-one",
      userId: USER_ONE,
      companyId: null,
      company: { name: "Example Labs" },
      title: "Product Engineer",
      status: "SAVED",
      source: "LinkedIn",
      sourceUrl: null,
      location: "Remote",
      salaryMin: null,
      salaryMax: null,
      description: null,
      notes: null,
      dateApplied: null,
      resumeVersionId: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "app-foreign",
      userId: USER_TWO,
      companyId: null,
      company: { name: "Private Co" },
      title: "Private Role",
      status: "SAVED",
      resumeVersionId: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "app-archived",
      userId: USER_ONE,
      companyId: null,
      company: { name: "History Co" },
      title: "Historical Role",
      status: "APPLIED",
      resumeVersionId: "resume-archived",
      createdAt: now,
      updatedAt: now,
    },
  ];
  const resumes = [
    resume("resume-one", USER_ONE, "Product resume"),
    resume("resume-two", USER_ONE, "Platform resume"),
    resume("resume-foreign", USER_TWO, "Private resume"),
    resume("resume-pending", USER_ONE, "Pending resume", { uploadStatus: "PENDING" }),
    resume("resume-archived", USER_ONE, "Archived resume", { archivedAt: now }),
  ];
  const activityLogs = [];
  const mutationTransactionChecks = [];
  let inTransaction = false;

  function resume(id, userId, name, overrides = {}) {
    return {
      id,
      userId,
      name,
      targetRole: "Software Engineer",
      storageKey: `users/${userId}/resumes/${id}/private.pdf`,
      originalFilename: `${id}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 42,
      checksum: "a".repeat(64),
      uploadStatus: "READY",
      notes: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  function hydrateApplication(row) {
    return {
      ...row,
      resumeVersion: resumes.find((candidate) => candidate.id === row.resumeVersionId) ?? null,
    };
  }

  const prisma = {
    application: {
      async findFirst({ where }) {
        const row = applications.find((candidate) => matchesWhere(candidate, where));
        return row ? hydrateApplication(row) : null;
      },
      async findMany({ where }) {
        return applications.filter((candidate) => matchesWhere(candidate, where)).map(hydrateApplication);
      },
      async update({ where, data }) {
        mutationTransactionChecks.push(["application.update", inTransaction]);
        const row = applications.find((candidate) => matchesWhere(candidate, where));
        Object.assign(row, data, { updatedAt: new Date() });
        return hydrateApplication(row);
      },
    },
    resumeVersion: {
      async findFirst({ where }) {
        return resumes.find((candidate) => matchesWhere(candidate, where)) ?? null;
      },
    },
    activityLog: {
      async create({ data }) {
        mutationTransactionChecks.push(["activityLog.create", inTransaction]);
        const row = { id: `activity-${activityLogs.length + 1}`, createdAt: new Date(), ...data };
        activityLogs.push(row);
        return row;
      },
      async findMany({ where }) {
        return activityLogs
          .filter((candidate) => matchesWhere(candidate, where))
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
      },
    },
    async $transaction(operation) {
      inTransaction = true;
      try {
        return await operation(prisma);
      } finally {
        inTransaction = false;
      }
    },
  };

  return { prisma, activityLogs, mutationTransactionChecks };
}

async function withApi(prisma, run) {
  const restoreAuth = mockManagedAuth(prisma);
  setPrismaForTests(prisma);
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreAuth();
  }
}

function jsonRequest(userId, body) {
  return {
    method: "PUT",
    headers: {
      authorization: `Bearer ${accessToken(userId)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

afterEach(() => setPrismaForTests(null));

test("attaching, replacing, and removing a resume writes safe responses and activity events", async () => {
  const db = createPrismaFake();

  await withApi(db.prisma, async (baseUrl) => {
    const attachedResponse = await fetch(
      `${baseUrl}/applications/app-one/resume`,
      jsonRequest(USER_ONE, { resumeVersionId: "resume-one" }),
    );
    assert.equal(attachedResponse.status, 200);
    const attached = await attachedResponse.json();
    assert.equal(attached.application.resumeVersionId, "resume-one");
    assert.equal(attached.application.resumeVersion.name, "Product resume");
    assert.equal(attached.application.resumeVersion.storageKey, undefined);
    assert.equal(attached.application.resumeVersion.checksum, undefined);

    const listResponse = await fetch(`${baseUrl}/applications`, {
      headers: { authorization: `Bearer ${accessToken(USER_ONE)}` },
    });
    const listed = await listResponse.json();
    const listedApplication = listed.applications.find((application) => application.id === "app-one");
    assert.equal(listedApplication.resumeVersion.originalFilename, "resume-one.pdf");
    assert.equal(listedApplication.resumeVersion.storageKey, undefined);

    const replacedResponse = await fetch(
      `${baseUrl}/applications/app-one/resume`,
      jsonRequest(USER_ONE, { resumeVersionId: "resume-two" }),
    );
    assert.equal(replacedResponse.status, 200);
    assert.equal((await replacedResponse.json()).application.resumeVersion.name, "Platform resume");

    const removedResponse = await fetch(
      `${baseUrl}/applications/app-one/resume`,
      jsonRequest(USER_ONE, { resumeVersionId: null }),
    );
    assert.equal(removedResponse.status, 200);
    const removed = await removedResponse.json();
    assert.equal(removed.application.resumeVersionId, null);
    assert.equal(removed.application.resumeVersion, null);

    const historyResponse = await fetch(`${baseUrl}/applications/app-one/history`, {
      headers: { authorization: `Bearer ${accessToken(USER_ONE)}` },
    });
    assert.equal(historyResponse.status, 200);
    const history = (await historyResponse.json()).history;
    assert.deepEqual(
      history.map((entry) => entry.type),
      ["RESUME_REMOVED", "RESUME_CHANGED", "RESUME_ATTACHED"],
    );
    assert.deepEqual(history[1].metadata, {
      previousResumeVersionId: "resume-one",
      previousResumeName: "Product resume",
      nextResumeVersionId: "resume-two",
      nextResumeName: "Platform resume",
    });
  });

  assert.ok(db.mutationTransactionChecks.length > 0);
  assert.equal(db.mutationTransactionChecks.every(([, inTransaction]) => inTransaction), true);
});

test("association endpoint rejects cross-user, nonexistent, incomplete, archived, and malformed selections", async () => {
  const db = createPrismaFake();

  await withApi(db.prisma, async (baseUrl) => {
    const scenarios = [
      ["app-foreign", USER_ONE, { resumeVersionId: "resume-one" }, 404, undefined],
      ["app-one", USER_ONE, { resumeVersionId: "missing" }, 404, APPLICATION_RESUME_ERROR_CODES.ACCESS_DENIED],
      ["app-one", USER_ONE, { resumeVersionId: "resume-foreign" }, 404, APPLICATION_RESUME_ERROR_CODES.ACCESS_DENIED],
      ["app-one", USER_ONE, { resumeVersionId: "resume-pending" }, 409, APPLICATION_RESUME_ERROR_CODES.INVALID_STATE],
      ["app-one", USER_ONE, { resumeVersionId: "resume-archived" }, 409, APPLICATION_RESUME_ERROR_CODES.ARCHIVED],
      ["app-one", USER_ONE, { resumeVersionId: "" }, 400, undefined],
      ["app-one", USER_ONE, { resumeVersionId: null, storageKey: "private" }, 400, undefined],
    ];

    for (const [applicationId, userId, body, status, code] of scenarios) {
      const response = await fetch(
        `${baseUrl}/applications/${applicationId}/resume`,
        jsonRequest(userId, body),
      );
      assert.equal(response.status, status);
      const payload = await response.json();
      if (code) assert.equal(payload.code, code);
    }
  });

  assert.equal(db.activityLogs.length, 0);
});

test("an archived historical association remains visible and can be kept or removed", async () => {
  const db = createPrismaFake();

  await withApi(db.prisma, async (baseUrl) => {
    const headers = { authorization: `Bearer ${accessToken(USER_ONE)}` };
    const detailResponse = await fetch(`${baseUrl}/applications/app-archived`, { headers });
    assert.equal(detailResponse.status, 200);
    const historical = (await detailResponse.json()).application;
    assert.equal(historical.resumeVersion.name, "Archived resume");
    assert.ok(historical.resumeVersion.archivedAt);
    assert.equal(historical.resumeVersion.storageKey, undefined);

    const unchangedResponse = await fetch(
      `${baseUrl}/applications/app-archived/resume`,
      jsonRequest(USER_ONE, { resumeVersionId: "resume-archived" }),
    );
    assert.equal(unchangedResponse.status, 200);
    assert.equal((await unchangedResponse.json()).changed, false);
    assert.equal(db.activityLogs.length, 0);

    const removedResponse = await fetch(
      `${baseUrl}/applications/app-archived/resume`,
      jsonRequest(USER_ONE, { resumeVersionId: null }),
    );
    assert.equal(removedResponse.status, 200);
    const removed = await removedResponse.json();
    assert.equal(removed.application.resumeVersion, null);
    assert.equal(db.activityLogs[0].type, "RESUME_REMOVED");
  });
});
