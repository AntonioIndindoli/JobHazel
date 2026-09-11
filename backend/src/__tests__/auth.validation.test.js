import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import { validateBody } from "../middleware/validate.middleware.js";
import { errorHandler, notFoundHandler } from "../middleware/error.middleware.js";
import {
  deleteAccountSchema,
  extensionRefreshSchema,
  loginSchema,
  passwordChangeSchema,
  profileSchema,
  signupSchema,
} from "../validators/auth.validators.js";

async function withServer(app, fn) {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function createTestAuthApp() {
  const app = express();
  app.use(express.json());
  app.post("/auth/signup", validateBody(signupSchema), (req, res) => res.status(201).json({ user: req.body.email }));
  app.post("/auth/login", validateBody(loginSchema), (req, res) => res.status(200).json({ user: req.body.email }));
  app.patch("/auth/profile", validateBody(profileSchema), (req, res) => res.status(200).json(req.body));
  app.patch("/auth/password", validateBody(passwordChangeSchema), (_req, res) => res.status(204).send());
  app.delete("/auth/account", validateBody(deleteAccountSchema), (_req, res) => res.status(204).send());
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

test("signup validation rejects invalid payload with details", async () => {
  const app = createTestAuthApp();
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "bad-email", password: "123" }),
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.message, "Invalid request payload.");
    assert.ok(body.details.some((d) => d.path === "email"));
    assert.ok(body.details.some((d) => d.path === "password"));
  });
});

test("login validation accepts normalized auth payload", async () => {
  const app = createTestAuthApp();
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "Test@Example.com", password: "password123" }),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.user, "test@example.com");
  });
});

test("central middleware returns 404 and 500 failure modes", async () => {
  const app404 = createTestAuthApp();
  await withServer(app404, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/missing-route`);
    assert.equal(response.status, 404);
  });

  const app500 = express();
  app500.get("/boom", () => {
    throw new Error("unexpected");
  });
  app500.use(errorHandler);

  await withServer(app500, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/boom`);
    assert.equal(response.status, 500);
  });
});

test("profile validation normalizes valid updates and rejects empty payloads", async () => {
  const app = createTestAuthApp();
  await withServer(app, async (baseUrl) => {
    const valid = await fetch(`${baseUrl}/auth/profile`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "  Taylor Doe  ", email: "Taylor@Example.com" }),
    });
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { name: "Taylor Doe", email: "taylor@example.com" });

    const empty = await fetch(`${baseUrl}/auth/profile`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(empty.status, 400);
  });
});

test("password and account deletion require secure confirmation fields", async () => {
  const app = createTestAuthApp();
  await withServer(app, async (baseUrl) => {
    const reusedPassword = await fetch(`${baseUrl}/auth/password`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: "password123", newPassword: "password123" }),
    });
    assert.equal(reusedPassword.status, 400);

    const missingConfirmation = await fetch(`${baseUrl}/auth/account`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(missingConfirmation.status, 400);
  });
});

test("extension refresh validation accepts a bounded token", () => {
  assert.deepEqual(extensionRefreshSchema.safeParse({ refreshToken: "token-value" }), {
    success: true,
    data: { refreshToken: "token-value" },
  });
  assert.equal(extensionRefreshSchema.safeParse({}).success, false);
  assert.equal(extensionRefreshSchema.safeParse({ refreshToken: "x".repeat(257) }).success, false);
});
