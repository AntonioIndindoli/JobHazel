import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCOUNT_LIMIT,
  ACCOUNT_LIMIT_MESSAGE,
  signup,
} from "./helpers/legacy-auth.fixture.js";

function createPrismaStub(accountCount) {
  const calls = [];
  const createdAt = new Date("2026-09-02T12:00:00.000Z");
  const transaction = {
    $queryRaw: async () => {
      calls.push("lock");
      return [];
    },
    user: {
      findUnique: async () => {
        calls.push("findUnique");
        return null;
      },
      count: async () => {
        calls.push("count");
        return accountCount;
      },
      create: async ({ data }) => {
        calls.push("create");
        return {
          id: "new-user",
          name: data.name,
          email: data.email,
          createdAt,
        };
      },
    },
  };

  return {
    calls,
    prisma: {
      $transaction: async (operation) => typeof operation === "function" ? operation(transaction) : Promise.all(operation),
      authToken: {
        deleteMany: async () => { calls.push("authToken.deleteMany"); },
        create: async () => { calls.push("authToken.create"); },
      },
      refreshToken: {
        create: async () => {
          calls.push("refreshToken.create");
        },
      },
    },
  };
}

test("signup counts accounts and creates an account below the limit", async () => {
  const { calls, prisma } = createPrismaStub(ACCOUNT_LIMIT - 1);

  const result = await signup(
    { name: "  Taylor Doe  ", email: "taylor@example.com", password: "password123" },
    prisma,
    { sendEmail: async () => { calls.push("sendEmail"); } },
  );

  assert.equal(result.status, 201);
  assert.equal(result.body.email, "taylor@example.com");
  assert.deepEqual(calls, ["lock", "findUnique", "count", "create", "authToken.deleteMany", "authToken.create", "sendEmail"]);
});

test("signup rejects account creation when the account limit is reached", async () => {
  const { calls, prisma } = createPrismaStub(ACCOUNT_LIMIT);

  const result = await signup(
    { name: "Taylor Doe", email: "taylor@example.com", password: "password123" },
    prisma,
  );

  assert.deepEqual(result, {
    status: 409,
    body: { message: ACCOUNT_LIMIT_MESSAGE },
  });
  assert.deepEqual(calls, ["lock", "findUnique", "count"]);
});
