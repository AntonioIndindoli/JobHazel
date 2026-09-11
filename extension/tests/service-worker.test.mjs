import assert from "node:assert/strict";
import test from "node:test";

import { buildJobCapture, captureStorageKey } from "../dist/development/capture.js";

const values = {};
let externalListener;

globalThis.chrome = {
  action: {
    onClicked: { addListener: () => undefined },
    setBadgeText: async () => undefined,
    setBadgeBackgroundColor: async () => undefined,
    setTitle: async () => undefined,
  },
  runtime: {
    onMessageExternal: {
      addListener: (listener) => {
        externalListener = listener;
      },
    },
  },
  storage: {
    session: {
      get: async (key) => {
        if (key === null) return { ...values };
        return Object.hasOwn(values, key) ? { [key]: values[key] } : {};
      },
      set: async (entries) => Object.assign(values, entries),
      remove: async (keys) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
      },
    },
  },
  scripting: { executeScript: async () => [] },
  tabs: {
    create: async () => ({ id: 1 }),
    update: async () => ({ id: 1 }),
    remove: async () => undefined,
  },
};

await import("../dist/development/service-worker.js");

function send(message, sender) {
  return new Promise((resolve) => {
    assert.equal(externalListener(message, sender, resolve), true);
  });
}

function storeCapture(captureId, destinationTabId, expiresAt = Date.now() + 60_000) {
  const capture = buildJobCapture(
    { sourceUrl: "https://jobs.example.com/7", pageTitle: "Engineer", rawText: "Description" },
    captureId,
  );
  values[captureStorageKey(captureId)] = { capture, expiresAt, destinationTabId };
  return capture;
}

const sender = {
  origin: "http://localhost:3000",
  url: "http://localhost:3000/?capture=test",
  tab: { id: 42 },
};

test("external retrieval enforces destination tab and acknowledges separately", async () => {
  const captureId = "123e4567-e89b-42d3-a456-426614174000";
  const capture = storeCapture(captureId, 42);
  const request = { version: 1, type: "jobhazel.capture.retrieve", captureId };

  assert.deepEqual(await send(request, sender), {
    version: 1,
    ok: true,
    type: request.type,
    capture,
  });
  assert.equal(Object.hasOwn(values, captureStorageKey(captureId)), true);

  const wrongTab = await send(request, { ...sender, tab: { id: 99 } });
  assert.equal(wrongTab.ok, false);
  assert.equal(wrongTab.error.code, "UNAUTHORIZED");

  const acknowledgment = await send(
    { version: 1, type: "jobhazel.capture.acknowledge", captureId },
    sender,
  );
  assert.equal(acknowledgment.ok, true);
  assert.equal(Object.hasOwn(values, captureStorageKey(captureId)), false);

  const repeated = await send(
    { version: 1, type: "jobhazel.capture.acknowledge", captureId },
    sender,
  );
  assert.equal(repeated.ok, true);
});

test("external retrieval rejects other origins and removes expired captures", async () => {
  const captureId = "223e4567-e89b-42d3-a456-426614174000";
  storeCapture(captureId, 42, 0);
  const request = { version: 1, type: "jobhazel.capture.retrieve", captureId };

  const unauthorized = await send(request, {
    origin: "https://evil.example",
    url: "https://evil.example/",
    tab: { id: 42 },
  });
  assert.equal(unauthorized.ok, false);
  assert.equal(unauthorized.error.code, "UNAUTHORIZED");

  const expired = await send(request, sender);
  assert.equal(expired.ok, false);
  assert.equal(expired.error.code, "CAPTURE_EXPIRED");
  assert.equal(Object.hasOwn(values, captureStorageKey(captureId)), false);
});
