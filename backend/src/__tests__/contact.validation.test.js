import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

import {
  validateContactPatchPayload,
  validateContactPayload,
} from "../validators/contact.validators.js";

async function withServer(app, run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post("/contacts", validateContactPayload, (req, res) => res.status(200).json(req.validatedContact));
  app.patch("/contacts/:id", validateContactPatchPayload, (req, res) => res.status(200).json(req.validatedContactPatch));
  return app;
}

test("contact create validation accepts normalized payload", async () => {
  await withServer(buildApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: " Ada Lovelace ",
        role: " Recruiter ",
        email: " ADA@EXAMPLE.COM ",
        phone: " +44 (20) 7946 0958 ext. 12 ",
        linkedinUrl: "https://www.linkedin.com/in/ada-lovelace",
        relationship: "RECRUITER",
        companyName: " ExampleCo ",
        applicationId: "app_123",
        notes: " Met at a hiring event. ",
      }),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.name, "Ada Lovelace");
    assert.equal(body.role, "Recruiter");
    assert.equal(body.email, "ada@example.com");
    assert.equal(body.phone, "+44 (20) 7946 0958 ext. 12");
    assert.equal(body.linkedinUrl, "https://www.linkedin.com/in/ada-lovelace");
    assert.equal(body.relationship, "RECRUITER");
    assert.equal(body.companyName, "ExampleCo");
    assert.equal(body.applicationId, "app_123");
    assert.equal(body.notes, "Met at a hiring event.");
  });
});

test("contact validation rejects invalid create payloads", async () => {
  await withServer(buildApp(), async (baseUrl) => {
    const missingName = await fetch(`${baseUrl}/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ relationship: "REFERRAL" }),
    });
    assert.equal(missingName.status, 400);
    assert.equal((await missingName.json()).message, "name is required.");

    const invalidRelationship = await fetch(`${baseUrl}/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ada", relationship: "FORMER_MANAGER" }),
    });
    assert.equal(invalidRelationship.status, 400);
    assert.equal((await invalidRelationship.json()).message, "relationship is invalid.");

    const duplicateCompanyReference = await fetch(`${baseUrl}/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ada", companyId: "company_123", companyName: "ExampleCo" }),
    });
    assert.equal(duplicateCompanyReference.status, 400);
    assert.equal((await duplicateCompanyReference.json()).message, "Provide either companyId or companyName, not both.");
  });
});

test("contact patch validation accepts partial updates and rejects empty bodies", async () => {
  await withServer(buildApp(), async (baseUrl) => {
    const accepted = await fetch(`${baseUrl}/contacts/contact_123`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        relationship: "HIRING_MANAGER",
        email: "",
        applicationId: "",
      }),
    });

    assert.equal(accepted.status, 200);
    const acceptedBody = await accepted.json();
    assert.equal(acceptedBody.relationship, "HIRING_MANAGER");
    assert.equal(acceptedBody.email, null);
    assert.equal(Object.hasOwn(acceptedBody, "phone"), false);
    assert.equal(acceptedBody.applicationId, null);

    const rejected = await fetch(`${baseUrl}/contacts/contact_123`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).message, "Provide at least one contact field to update.");
  });
});

test("contact phone can be updated independently and cleared", async () => {
  await withServer(buildApp(), async (baseUrl) => {
    for (const [phone, expected] of [[" +1 (415) 555-0123 ", "+1 (415) 555-0123"], ["  ", null], [null, null]]) {
      const response = await fetch(`${baseUrl}/contacts/contact_123`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { phone: expected });
    }
  });
});

test("contact phone rejects oversized and non-string values on create and update", async () => {
  await withServer(buildApp(), async (baseUrl) => {
    for (const method of ["POST", "PATCH"]) {
      for (const phone of ["1".repeat(51), 4155550123, { number: "4155550123" }]) {
        const response = await fetch(`${baseUrl}/contacts${method === "PATCH" ? "/contact_123" : ""}`, {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Ada", phone }),
        });
        assert.equal(response.status, 400);
        assert.match((await response.json()).message, /^phone must be/);
      }
    }
  });
});
