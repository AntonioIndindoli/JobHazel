import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPTURE_TTL_MS,
  CaptureError,
  buildJobCapture,
  captureStorageKey,
  isStoredCapture,
  selectCaptureKeysToRemove,
} from "../dist/development/capture.js";

test("buildJobCapture derives the domain and keeps selected text", () => {
  const capture = buildJobCapture(
    {
      sourceUrl: "https://Jobs.Example.com/posting?id=7",
      pageTitle: " Software Engineer ",
      rawText: " Responsibilities and qualifications ",
    },
    "capture-1",
    100,
  );

  assert.deepEqual(capture, {
    version: 1,
    captureId: "capture-1",
    createdAt: 100,
    sourceUrl: "https://jobs.example.com/posting?id=7",
    sourceDomain: "jobs.example.com",
    pageTitle: "Software Engineer",
    rawText: "Responsibilities and qualifications",
    warnings: [],
  });
});

test("buildJobCapture allows no selection and records a review warning", () => {
  const capture = buildJobCapture(
    { sourceUrl: "http://example.com/job", pageTitle: "Job", rawText: "  " },
    "capture-2",
  );
  assert.deepEqual(capture.warnings, ["NO_TEXT_SELECTED"]);
  assert.equal(capture.rawText, "");
});

test("buildJobCapture truncates bounded text fields and records warnings", () => {
  const capture = buildJobCapture(
    {
      sourceUrl: "https://example.com/job",
      pageTitle: "T".repeat(301),
      rawText: "D".repeat(100_001),
    },
    "capture-3",
  );
  assert.equal(capture.pageTitle.length, 300);
  assert.equal(capture.rawText.length, 100_000);
  assert.deepEqual(capture.warnings, ["PAGE_TITLE_TRUNCATED", "SELECTED_TEXT_TRUNCATED"]);
});

test("buildJobCapture rejects unsupported protocols and oversized URLs", () => {
  assert.throws(
    () => buildJobCapture({ sourceUrl: "chrome://extensions", pageTitle: "", rawText: "" }, "x"),
    (error) => error instanceof CaptureError && error.code === "UNSUPPORTED_PAGE",
  );
  assert.throws(
    () => buildJobCapture({ sourceUrl: `https://example.com/${"a".repeat(2_001)}`, pageTitle: "", rawText: "" }, "x"),
    (error) => error instanceof CaptureError && error.code === "PAYLOAD_TOO_LARGE",
  );
});

test("stored record helpers use the capture prefix and recognize valid records", () => {
  const capture = buildJobCapture(
    { sourceUrl: "https://example.com/job", pageTitle: "Job", rawText: "Text" },
    "capture-4",
    500,
  );
  assert.equal(captureStorageKey(capture.captureId), "jobhazel.capture.capture-4");
  assert.equal(isStoredCapture({ capture, expiresAt: 500 + CAPTURE_TTL_MS }), true);
  assert.equal(isStoredCapture({ capture }), false);
});

test("storage pruning removes expired, malformed, and oldest excess captures", () => {
  const values = { unrelated: "keep", "jobhazel.capture.bad": { nope: true } };
  for (let index = 0; index < 11; index += 1) {
    const capture = buildJobCapture(
      { sourceUrl: `https://example.com/job/${index}`, pageTitle: "Job", rawText: "Text" },
      String(index),
      1_000 + index,
    );
    values[captureStorageKey(capture.captureId)] = {
      capture,
      expiresAt: index === 10 ? 1_500 : 5_000,
    };
  }

  assert.deepEqual(selectCaptureKeysToRemove(values, 2_000, 1).sort(), [
    "jobhazel.capture.0",
    "jobhazel.capture.10",
    "jobhazel.capture.bad",
  ]);
  assert.deepEqual(selectCaptureKeysToRemove(values, 2_000).sort(), [
    "jobhazel.capture.10",
    "jobhazel.capture.bad",
  ]);
});
