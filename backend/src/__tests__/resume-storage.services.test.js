import assert from "node:assert/strict";
import test from "node:test";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { createR2ResumeStorage } from "../services/r2-resume-storage.services.js";
import { createResumeStorage, RESUME_STORAGE_METHODS } from "../services/resume-storage.services.js";

test("resume storage interface accepts a fake adapter and rejects incomplete adapters", async () => {
  const calls = [];
  const fake = Object.fromEntries(
    RESUME_STORAGE_METHODS.map((method) => [method, async (...args) => calls.push([method, ...args])]),
  );
  const storage = createResumeStorage(fake);
  await storage.inspectObject("users/user-1/resumes/resume-1/file.pdf");
  assert.deepEqual(calls, [["inspectObject", "users/user-1/resumes/resume-1/file.pdf"]]);
  assert.throws(() => createResumeStorage({ inspectObject() {} }), /missing methods/);
});

test("R2 adapter presigns private object operations and inspects metadata", async () => {
  const sent = [];
  const client = {
    async send(command) {
      sent.push(command);
      if (command instanceof HeadObjectCommand) {
        return {
          ContentLength: 1234,
          ContentType: "application/pdf",
          ETag: '"etag"',
          LastModified: new Date("2026-09-01T00:00:00.000Z"),
        };
      }
      if (command instanceof GetObjectCommand) {
        return { Body: { transformToByteArray: async () => Uint8Array.from([37, 80, 68, 70, 45]) } };
      }
      return {};
    },
  };
  const signed = [];
  const presign = async (_client, command, options) => {
    signed.push({ command, options });
    return "https://private.example/signed";
  };
  const storage = createR2ResumeStorage({
    client,
    presign,
    bucketName: "jobhazel-resumes",
    signedUrlTtlSeconds: 300,
  });
  const key = "users/user-1/resumes/resume-1/file.pdf";

  assert.equal(await storage.presignUpload({ key, contentType: "application/pdf" }), "https://private.example/signed");
  assert.ok(signed[0].command instanceof PutObjectCommand);
  assert.deepEqual(signed[0].command.input, {
    Bucket: "jobhazel-resumes",
    Key: key,
    ContentType: "application/pdf",
  });
  assert.deepEqual(signed[0].options, { expiresIn: 300 });
  assert.equal("ACL" in signed[0].command.input, false);

  assert.equal(
    await storage.presignDownload({ key, downloadFilename: "Product Resume.pdf" }),
    "https://private.example/signed",
  );
  assert.ok(signed[1].command instanceof GetObjectCommand);
  assert.deepEqual(signed[1].options, { expiresIn: 300 });
  assert.match(signed[1].command.input.ResponseContentDisposition, /^attachment;/);

  const metadata = await storage.inspectObject(key);
  assert.equal(metadata.sizeBytes, 1234);
  assert.equal(metadata.contentType, "application/pdf");
  assert.ok(sent[0] instanceof HeadObjectCommand);

  assert.deepEqual(await storage.readObjectRange(key), Buffer.from("%PDF-"));
  assert.equal(sent[1].input.Range, "bytes=0-4");

  await storage.deleteObject(key);
  assert.ok(sent[2] instanceof DeleteObjectCommand);
});

test("R2 adapter normalizes missing objects and bounds inspection reads", async () => {
  const notFound = new Error("missing");
  notFound.$metadata = { httpStatusCode: 404 };
  const storage = createR2ResumeStorage({
    client: { send: async () => Promise.reject(notFound) },
    presign: async () => "unused",
    bucketName: "jobhazel-resumes",
  });
  assert.equal(await storage.inspectObject("missing.pdf"), null);
  await assert.rejects(
    storage.readObjectRange("file.pdf", { start: 0, end: 64 * 1024 }),
    /cannot exceed/,
  );
});
