import assert from "node:assert/strict";
import test from "node:test";

import { validateApplicationPayload } from "../validators/application.validators.js";

test("new applications default to applied when status is omitted", () => {
  const req = { body: { title: "Software Engineer" } };
  const res = {
    status() {
      throw new Error("Validation unexpectedly failed.");
    },
  };

  validateApplicationPayload(req, res, () => {});

  assert.equal(req.validatedApplication.status, "APPLIED");
});
