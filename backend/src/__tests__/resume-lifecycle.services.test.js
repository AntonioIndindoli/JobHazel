import assert from "node:assert/strict";
import test from "node:test";

import { deleteAccount, signup } from "../services/auth.services.js";
import {
  cleanupAbandonedResumeUploads,
  getResumeMaintenanceStatus,
} from "../services/resume-maintenance.services.js";
import { consumeResumeRateLimit } from "../services/resume-rate-limit.services.js";

test("database-backed resume rate limits reset after their configured window", async () => {
  let row = null;
  const prisma = {
    resumeEndpointRateLimit: {
      async findUnique() {
        return row;
      },
      async upsert({ create, update }) {
        row = row ? { ...row, ...update } : { ...create };
        return row;
      },
      async update({ data }) {
        row.requestCount += data.requestCount.increment;
        return row;
      },
    },
    async $queryRaw() {
      return [];
    },
    async $transaction(operation) {
      return operation(prisma);
    },
  };
  const firstWindow = new Date("2026-09-09T12:00:00.000Z");

  const first = await consumeResumeRateLimit(
    "user-one",
    "download-url",
    { limit: 2, windowSeconds: 60, now: firstWindow },
    prisma,
  );
  const second = await consumeResumeRateLimit(
    "user-one",
    "download-url",
    { limit: 2, windowSeconds: 60, now: new Date("2026-09-09T12:00:10.000Z") },
    prisma,
  );
  const blocked = await consumeResumeRateLimit(
    "user-one",
    "download-url",
    { limit: 2, windowSeconds: 60, now: new Date("2026-09-09T12:00:20.000Z") },
    prisma,
  );
  const reset = await consumeResumeRateLimit(
    "user-one",
    "download-url",
    { limit: 2, windowSeconds: 60, now: new Date("2026-09-09T12:01:01.000Z") },
    prisma,
  );

  assert.deepEqual(
    [first.allowed, second.allowed, blocked.allowed, reset.allowed],
    [true, true, false, true],
  );
  assert.deepEqual(
    [first.remaining, second.remaining, blocked.remaining, reset.remaining],
    [1, 0, 0, 1],
  );
});

function createCleanupPrisma() {
  const old = new Date("2026-09-07T00:00:00.000Z");
  const recent = new Date("2026-09-09T11:30:00.000Z");
  const resumes = [
    { id: "old-pending", userId: "user-one", storageKey: "old-pending.pdf", sizeBytes: 100, uploadStatus: "PENDING", updatedAt: old },
    { id: "old-failed", userId: "user-one", storageKey: "old-failed.pdf", sizeBytes: 200, uploadStatus: "FAILED", updatedAt: old },
    { id: "recent-pending", userId: "user-one", storageKey: "recent-pending.pdf", sizeBytes: 300, uploadStatus: "PENDING", updatedAt: recent },
    { id: "ready", userId: "user-one", storageKey: "ready.pdf", sizeBytes: 400, uploadStatus: "READY", updatedAt: old },
  ];
  const runs = [];

  function matchesLifecycleWhere(row, where) {
    if (where.id && row.id !== where.id) return false;
    if (where.userId && row.userId !== where.userId) return false;
    if (where.uploadStatus?.in && !where.uploadStatus.in.includes(row.uploadStatus)) return false;
    if (where.updatedAt?.lte && row.updatedAt > where.updatedAt.lte) return false;
    return true;
  }

  const prisma = {
    resumeVersion: {
      async findMany({ where, take }) {
        return resumes
          .filter((row) => matchesLifecycleWhere(row, where))
          .sort((left, right) => left.updatedAt - right.updatedAt)
          .slice(0, take);
      },
      async findFirst({ where }) {
        return resumes.find((row) => matchesLifecycleWhere(row, where)) ?? null;
      },
      async deleteMany({ where }) {
        const index = resumes.findIndex((row) => matchesLifecycleWhere(row, where));
        if (index === -1) return { count: 0 };
        resumes.splice(index, 1);
        return { count: 1 };
      },
      async groupBy() {
        const groups = new Map();
        for (const row of resumes) {
          const current = groups.get(row.uploadStatus) ?? { count: 0, bytes: 0 };
          current.count += 1;
          current.bytes += row.sizeBytes;
          groups.set(row.uploadStatus, current);
        }
        return Array.from(groups, ([uploadStatus, values]) => ({
          uploadStatus,
          _count: { _all: values.count },
          _sum: { sizeBytes: values.bytes },
        }));
      },
      async count({ where }) {
        return resumes.filter((row) => matchesLifecycleWhere(row, where)).length;
      },
    },
    resumeCleanupRun: {
      async create({ data }) {
        const run = {
          id: `run-${runs.length + 1}`,
          scannedCount: 0,
          deletedCount: 0,
          failedCount: 0,
          skippedCount: 0,
          reclaimedBytes: 0n,
          failureResumeIds: null,
          completedAt: null,
          ...data,
        };
        runs.push(run);
        return run;
      },
      async update({ where, data }) {
        const run = runs.find((candidate) => candidate.id === where.id);
        Object.assign(run, data);
        return run;
      },
      async findFirst() {
        return runs.at(-1) ?? null;
      },
    },
    async $queryRaw() {
      return [];
    },
    async $transaction(operation) {
      return operation(prisma);
    },
  };
  return { prisma, resumes, runs };
}

test("abandoned upload cleanup is observable, retryable, and idempotent", async () => {
  const db = createCleanupPrisma();
  let failOldFailed = true;
  const storage = {
    deletedKeys: [],
    async deleteObject(key) {
      if (key === "old-failed.pdf" && failOldFailed) throw new Error("temporary outage");
      this.deletedKeys.push(key);
    },
  };
  const options = {
    prisma: db.prisma,
    storage,
    now: new Date("2026-09-09T12:00:00.000Z"),
    staleHours: 24,
    batchSize: 10,
  };

  const partial = await cleanupAbandonedResumeUploads(options);
  assert.equal(partial.status, "PARTIAL");
  assert.equal(partial.deletedCount, 1);
  assert.equal(partial.failedCount, 1);
  assert.equal(partial.reclaimedBytes, 100);
  assert.deepEqual(db.resumes.map((row) => row.id).sort(), ["old-failed", "ready", "recent-pending"]);

  failOldFailed = false;
  const retried = await cleanupAbandonedResumeUploads(options);
  assert.equal(retried.status, "COMPLETED");
  assert.equal(retried.deletedCount, 1);
  assert.equal(retried.reclaimedBytes, 200);

  const idempotent = await cleanupAbandonedResumeUploads(options);
  assert.equal(idempotent.deletedCount, 0);
  assert.equal(idempotent.failedCount, 0);

  const status = await getResumeMaintenanceStatus(options);
  assert.equal(status.staleIncompleteCount, 0);
  assert.equal(status.storageByStatus.READY.recordCount, 1);
  assert.equal(status.storageByStatus.PENDING.recordCount, 1);
  assert.equal(status.latestCleanupRun.status, "COMPLETED");
});

test("abandoned upload cleanup records job-level failures", async () => {
  const db = createCleanupPrisma();
  db.prisma.resumeVersion.findMany = async () => {
    throw new Error("database unavailable");
  };

  await assert.rejects(
    cleanupAbandonedResumeUploads({
      prisma: db.prisma,
      storage: { async deleteObject() {} },
      now: new Date("2026-09-09T12:00:00.000Z"),
      staleHours: 24,
      batchSize: 10,
    }),
    /database unavailable/,
  );

  assert.equal(db.runs[0].status, "FAILED");
  assert.equal(db.runs[0].completedAt.toISOString(), "2026-09-09T12:00:00.000Z");
});

function createAccountPrisma() {
  let user = null;
  const resumeObjects = [
    { id: "resume-one", storageKey: "resume-one.pdf" },
    { id: "resume-two", storageKey: "resume-two.pdf" },
  ];
  const prisma = {
    user: {
      async findUnique({ where }) {
        if (!user) return null;
        if (where.id && where.id !== user.id) return null;
        if (where.email && where.email !== user.email) return null;
        return user;
      },
      async count() {
        return user ? 1 : 0;
      },
      async create({ data }) {
        user = {
          id: "account-user",
          name: data.name ?? null,
          email: data.email,
          passwordHash: data.passwordHash,
          createdAt: new Date("2026-09-09T12:00:00.000Z"),
        };
        return user;
      },
      async delete() {
        user = null;
        resumeObjects.splice(0);
      },
    },
    refreshToken: {
      async create() {
        return {};
      },
    },
    authToken: {
      async deleteMany() { return { count: 0 }; },
      async create() { return {}; },
    },
    resumeVersion: {
      async findMany() {
        return [...resumeObjects];
      },
    },
    async $queryRaw() {
      return [];
    },
    async $transaction(operation) {
      return typeof operation === "function" ? operation(prisma) : Promise.all(operation);
    },
  };
  return { prisma, getUser: () => user };
}

test("account deletion preserves the account until every private resume object is cleaned", async () => {
  const db = createAccountPrisma();
  await signup(
    { name: "Test User", email: "test@example.com", password: "SecurePassword123!" },
    db.prisma,
    { sendEmail: async () => undefined },
  );
  const deletedKeys = new Set();
  let failSecondObject = true;
  const storage = {
    async deleteObject(key) {
      if (key === "resume-two.pdf" && failSecondObject) throw new Error("temporary outage");
      deletedKeys.add(key);
    },
  };

  const failed = await deleteAccount("account-user", "SecurePassword123!", {
    prisma: db.prisma,
    storage,
  });
  assert.equal(failed.status, 503);
  assert.equal(failed.body.code, "ACCOUNT_STORAGE_CLEANUP_FAILED");
  assert.ok(db.getUser());
  assert.deepEqual(Array.from(deletedKeys), ["resume-one.pdf"]);

  failSecondObject = false;
  const retried = await deleteAccount("account-user", "SecurePassword123!", {
    prisma: db.prisma,
    storage,
  });
  assert.equal(retried.status, 204);
  assert.equal(db.getUser(), null);
  assert.deepEqual(Array.from(deletedKeys).sort(), ["resume-one.pdf", "resume-two.pdf"]);
});
