// Synthetic records only, on an explicitly selected isolated direct database.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.TEST_NOTIFICATION_DATABASE_URL;
const host = process.env.TEST_NOTIFICATION_DATABASE_HOST;
if (!connectionString || !host || new URL(connectionString).hostname !== host || host.includes("-pooler")) throw Error("Set an isolated direct TEST_NOTIFICATION_DATABASE_URL and matching host.");
for (const file of [".env", ".env.local"]) {
  if (!fs.existsSync(file)) continue;
  const values = dotenv.parse(fs.readFileSync(file));
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) if (values[key] && new URL(values[key]).hostname.replace("-pooler", "") === host) throw Error("Refusing the application database.");
}
process.env.DATABASE_URL = connectionString;
process.env.NOTIFICATION_MODE = "legacy";
const { setPrismaForTests } = await import("../src/db/prisma.js");
const { createApplication, updateApplication } = await import("../src/services/applications.services.js");
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
setPrismaForTests(prisma);
const users = [];
try {
  const user = await prisma.user.create({ data: { email: `atomic-${crypto.randomUUID()}@example.com`, autoCreateFollowUpTasks: true } }); users.push(user.id);
  const other = await prisma.user.create({ data: { email: `atomic-${crypto.randomUUID()}@example.com` } }); users.push(other.id);
  const resume = await prisma.resumeVersion.create({ data: { userId: user.id, name: "Test PDF", storageKey: `synthetic-${crypto.randomUUID()}`, originalFilename: "test.pdf", mimeType: "application/pdf", sizeBytes: 42, uploadStatus: "READY" } });
  const foreign = await prisma.resumeVersion.create({ data: { userId: other.id, name: "Foreign", storageKey: `synthetic-${crypto.randomUUID()}`, originalFilename: "test.pdf", mimeType: "application/pdf", sizeBytes: 42, uploadStatus: "READY" } });
  const payload = { title: "Atomic role", status: "APPLIED", companyName: "Atomic company", resumeVersionId: resume.id };
  // Inject a failed history write into a real SQL transaction, after application
  // creation. Verify the database rolled back company/application/history.
  setPrismaForTests({ ...prisma, application: prisma.application, $transaction: (fn) => prisma.$transaction(tx => fn(new Proxy(tx, { get(target, key) {
    if (key === "activityLog") return { create: async ({ data }) => { if (data.type.startsWith("RESUME_")) throw Error("injected history failure"); return tx.activityLog.create({ data }); } };
    return Reflect.get(target, key);
  } }))) });
  await assert.rejects(createApplication(user.id, payload), /injected history failure/);
  assert.equal(await prisma.application.count({ where: { userId: user.id } }), 0);
  assert.equal(await prisma.company.count({ where: { userId: user.id } }), 0);
  assert.equal(await prisma.activityLog.count({ where: { userId: user.id } }), 0);
  setPrismaForTests(prisma);
  await assert.rejects(createApplication(user.id, { ...payload, resumeVersionId: foreign.id }), { code: "APPLICATION_RESUME_ACCESS_DENIED" });
  const result = await createApplication(user.id, payload);
  assert.equal(result.application.resumeVersion.id, resume.id);
  assert.equal(result.createdTasks.length, 1);
  const before = await prisma.application.findUnique({ where: { id: result.application.id } });
  await assert.rejects(updateApplication(user.id, before.id, { ...payload, title: "Must roll back", resumeVersionId: foreign.id }), { code: "APPLICATION_RESUME_ACCESS_DENIED" });
  assert.deepEqual(await prisma.application.findUnique({ where: { id: before.id } }), before);
  await prisma.resumeVersion.update({ where: { id: resume.id }, data: { archivedAt: new Date() } });
  await updateApplication(user.id, before.id, { ...payload, title: "Keep history" });
  await assert.rejects(createApplication(user.id, { ...payload, title: "New archived association" }), { code: "APPLICATION_RESUME_ARCHIVED" });
  await updateApplication(user.id, before.id, { ...payload, title: "Remove resume", resumeVersionId: null });
  assert.equal((await prisma.application.findUnique({ where: { id: before.id } })).resumeVersionId, null);
  assert.equal(await prisma.activityLog.count({ where: { applicationId: before.id, type: "RESUME_REMOVED" } }), 1);
  console.log("PASS: real SQL atomic save, rollback after history failure, cross-user rejection, follow-up task creation, historical archived resume retention and removal.");
} finally {
  setPrismaForTests(null);
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect(); await pool.end();
}
