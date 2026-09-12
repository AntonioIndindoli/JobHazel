import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { setPrismaForTests } from "../db/prisma.js";
import {
  RESUME_ANALYTICS_MINIMUM_SAMPLE_SIZE,
  buildResumeAnalyticsRows,
  getResumeAnalytics,
} from "../services/resume-analytics.services.js";

afterEach(() => setPrismaForTests(null));

test("resume analytics includes archived and no-resume groups with reconciled outcomes", () => {
  const rows = buildResumeAnalyticsRows({
    resumes: [
      { id: "active", name: "Product resume", targetRole: "Product Manager", archivedAt: null },
      { id: "archived", name: "Old resume", targetRole: null, archivedAt: new Date("2026-01-01") },
    ],
    applications: [
      { id: "offer", resumeVersionId: "active", status: "OFFER", interviews: [] },
      { id: "rejected", resumeVersionId: "active", status: "REJECTED", interviews: [] },
      { id: "historical", resumeVersionId: "archived", status: "REJECTED", interviews: [{ id: "i1" }] },
      { id: "none", resumeVersionId: null, status: "APPLIED", interviews: [] },
      { id: "deleted", resumeVersionId: "missing", status: "WITHDRAWN", interviews: [] },
      { id: "saved", resumeVersionId: "active", status: "SAVED", interviews: [] },
    ],
    histories: [
      {
        applicationId: "rejected",
        type: "STATUS_CHANGED",
        metadata: { from: "INTERVIEWING", to: "REJECTED" },
      },
    ],
  });

  const active = rows.find((row) => row.resumeVersionId === "active");
  assert.deepEqual(
    {
      submitted: active.submittedApplications,
      responses: active.responses,
      interviews: active.interviews,
      offers: active.offers,
      interviewRate: active.interviewRate,
      offerRate: active.offerRate,
    },
    { submitted: 2, responses: 2, interviews: 2, offers: 1, interviewRate: 100, offerRate: 50 },
  );

  const archived = rows.find((row) => row.resumeVersionId === "archived");
  assert.ok(archived.archivedAt);
  assert.equal(archived.interviews, 1);

  const noResume = rows.find((row) => row.isNoResume);
  assert.equal(noResume.submittedApplications, 2);
  assert.equal(noResume.name, "No resume or deleted version");
  assert.equal(noResume.eligibleForComparison, false);
});

test("resume analytics queries every data source with the authenticated user id", async () => {
  const seenWhere = [];
  setPrismaForTests({
    resumeVersion: {
      async findMany(query) {
        seenWhere.push(query.where);
        return [];
      },
    },
    application: {
      async findMany(query) {
        seenWhere.push(query.where);
        return [];
      },
    },
    activityLog: {
      async findMany(query) {
        seenWhere.push(query.where);
        return [];
      },
    },
  });

  const result = await getResumeAnalytics("user-one");
  assert.deepEqual(seenWhere, [
    { userId: "user-one", uploadStatus: "READY" },
    { userId: "user-one" },
    { userId: "user-one" },
  ]);
  assert.equal(result.minimumSampleSize, RESUME_ANALYTICS_MINIMUM_SAMPLE_SIZE);
  assert.deepEqual(result.rows, []);
});
