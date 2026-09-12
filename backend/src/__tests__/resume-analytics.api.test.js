import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { afterEach } from "node:test";

import { createApp } from "../app.js";
import { env } from "../config/env.js";
import { setPrismaForTests } from "../db/prisma.js";

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

async function withApi(prisma, run) {
  setPrismaForTests(prisma);
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

afterEach(() => setPrismaForTests(null));

test("resume analytics endpoint requires authentication and returns user-scoped results", async () => {
  const prisma = {
    resumeVersion: {
      async findMany({ where }) {
        assert.deepEqual(where, { userId: "user-one", uploadStatus: "READY" });
        return [{ id: "resume-one", name: "Core resume", targetRole: null, archivedAt: null }];
      },
    },
    application: {
      async findMany({ where }) {
        assert.deepEqual(where, { userId: "user-one" });
        return [{ id: "app-one", resumeVersionId: "resume-one", status: "OFFER", interviews: [] }];
      },
    },
    activityLog: {
      async findMany({ where }) {
        assert.deepEqual(where, { userId: "user-one" });
        return [];
      },
    },
  };

  await withApi(prisma, async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/resumes/analytics`);
    assert.equal(unauthorized.status, 401);

    const response = await fetch(`${baseUrl}/resumes/analytics`, {
      headers: { authorization: `Bearer ${accessToken("user-one")}` },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.minimumSampleSize, 5);
    assert.equal(payload.rows[0].name, "Core resume");
    assert.equal(payload.rows[0].submittedApplications, 1);
    assert.equal(payload.rows[0].offers, 1);
    assert.equal(payload.rows[0].offerRate, 100);
  });
});
