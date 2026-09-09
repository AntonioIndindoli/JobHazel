import assert from "node:assert/strict";
import test from "node:test";

import {
  resumeListQuerySchema,
  resumePatchSchema,
  resumeUploadSchema,
} from "../validators/resume.validators.js";
import {
  buildOwnedResumeWhere,
  buildResumeListWhere,
  buildResumeStorageKey,
  isResumeUploadTransitionAllowed,
} from "../services/resumes.services.js";

test("resume upload validation normalizes trusted metadata fields", () => {
  const checksum = "A".repeat(64);
  const parsed = resumeUploadSchema.safeParse({
    name: "  Product Resume  ",
    targetRole: "  Product Manager ",
    originalFilename: "C:\\fakepath\\Product Resume.PDF",
    mimeType: " APPLICATION/PDF ",
    sizeBytes: 2048,
    checksum,
    notes: "  Tailored for product roles. ",
  });

  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data, {
    name: "Product Resume",
    targetRole: "Product Manager",
    originalFilename: "Product Resume.PDF",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    checksum: checksum.toLowerCase(),
    notes: "Tailored for product roles.",
  });
});

test("resume upload validation rejects non-PDF, invalid size, checksum, and unknown fields", () => {
  const parsed = resumeUploadSchema.safeParse({
    name: "Resume",
    originalFilename: "resume.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sizeBytes: 0,
    checksum: "not-a-sha256",
    storageKey: "client-controlled.pdf",
  });

  assert.equal(parsed.success, false);
  const paths = parsed.error.issues.map((issue) => issue.path.join("."));
  assert.ok(paths.includes("originalFilename"));
  assert.ok(paths.includes("mimeType"));
  assert.ok(paths.includes("sizeBytes"));
  assert.ok(paths.includes("checksum"));
  assert.ok(paths.includes("storageKey"));
});

test("resume patch validation permits metadata and archive state but rejects file replacement", () => {
  const accepted = resumePatchSchema.safeParse({ name: " Updated ", notes: "", archived: true });
  assert.deepEqual(accepted, {
    success: true,
    data: { name: "Updated", notes: null, archived: true },
  });

  const rejected = resumePatchSchema.safeParse({ originalFilename: "replacement.pdf" });
  assert.equal(rejected.success, false);
  assert.equal(rejected.error.issues[0].path[0], "originalFilename");
});

test("resume query, key generation, transitions, and ownership predicates are deterministic", () => {
  assert.deepEqual(resumeListQuerySchema.safeParse({ includeArchived: "true" }), {
    success: true,
    data: { includeArchived: true },
  });
  assert.equal(resumeListQuerySchema.safeParse({ includeArchived: "sometimes" }).success, false);

  const key = buildResumeStorageKey("user-1", "resume-1", "a".repeat(36));
  assert.equal(key, `users/user-1/resumes/resume-1/${"a".repeat(36)}.pdf`);

  assert.deepEqual(buildOwnedResumeWhere("user-1", "resume-1"), { id: "resume-1", userId: "user-1" });
  assert.deepEqual(buildResumeListWhere("user-1"), {
    userId: "user-1",
    uploadStatus: "READY",
    archivedAt: null,
  });
  assert.equal(isResumeUploadTransitionAllowed("PENDING", "READY"), true);
  assert.equal(isResumeUploadTransitionAllowed("PENDING", "FAILED"), true);
  assert.equal(isResumeUploadTransitionAllowed("READY", "PENDING"), false);
  assert.equal(isResumeUploadTransitionAllowed("READY", "READY"), false);
});
