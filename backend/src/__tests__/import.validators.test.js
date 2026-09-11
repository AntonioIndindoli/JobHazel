import assert from "node:assert/strict";
import test from "node:test";

import { validateCreateDraftPayload } from "../validators/import.validators.js";

function validate({ body, idempotencyKey }) {
  let nextCalled = false;
  let response;
  const req = {
    body,
    get: (name) => (name === "Idempotency-Key" ? idempotencyKey : undefined),
  };
  const res = {
    status(status) {
      response = { status };
      return {
        json(payload) {
          response.payload = payload;
          return response;
        },
      };
    },
  };
  validateCreateDraftPayload(req, res, () => {
    nextCalled = true;
  });
  return { req, nextCalled, response };
}

test("create draft validator accepts a UUID idempotency header", () => {
  const captureId = "123e4567-e89b-42d3-a456-426614174000";
  const result = validate({
    body: { sourceUrl: "https://jobs.example.com/7" },
    idempotencyKey: captureId,
  });
  assert.equal(result.nextCalled, true);
  assert.equal(result.req.validatedImportDraft.captureId, captureId);
});

test("create draft validator rejects an invalid idempotency header", () => {
  const result = validate({
    body: { sourceUrl: "https://jobs.example.com/7" },
    idempotencyKey: "predictable-key",
  });
  assert.equal(result.nextCalled, false);
  assert.equal(result.response.status, 400);
  assert.equal(result.response.payload.message, "Idempotency-Key must be a valid capture ID.");
});
