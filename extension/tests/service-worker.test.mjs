import assert from "node:assert/strict";
import test from "node:test";

const values = {};
let actionListener;
let messageListener;
let openedPanelTabId;
let createdTabCount = 0;

globalThis.setTimeout = () => 0;
globalThis.chrome = {
  action: {
    onClicked: { addListener: (listener) => { actionListener = listener; } },
    setBadgeText: async () => undefined,
    setBadgeBackgroundColor: async () => undefined,
    setTitle: async () => undefined,
  },
  sidePanel: { open: async ({ tabId }) => { openedPanelTabId = tabId; } },
  runtime: {
    onMessage: { addListener: (listener) => { messageListener = listener; } },
  },
  storage: {
    session: {
      get: async () => ({ ...values }),
      set: async (entries) => Object.assign(values, entries),
      remove: async (keys) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
      },
    },
  },
  scripting: {
    executeScript: async () => [{ result: {
      sourceUrl: "https://jobs.example.com/role/7",
      pageTitle: "Frontend Engineer",
      rawText: "Build useful products.",
    } }],
  },
  tabs: {
    query: async () => [{ id: 42, url: "https://jobs.example.com/role/7" }],
    create: async () => { createdTabCount += 1; return { id: 99 }; },
  },
};

await import("../dist/development/service-worker.js");

test("toolbar capture opens the side panel and never creates a browser tab", async () => {
  await actionListener({ id: 42, url: "https://jobs.example.com/role/7" });
  assert.equal(openedPanelTabId, 42);
  assert.equal(createdTabCount, 0);
  const captures = Object.entries(values).filter(([key]) => key.startsWith("jobhazel.capture."));
  assert.equal(captures.length, 1);
  assert.equal(captures[0][1].capture.pageTitle, "Frontend Engineer");
});

test("unsupported pages still open the panel without creating a tab", async () => {
  await actionListener({ id: 43, url: "chrome://extensions" });
  assert.equal(openedPanelTabId, 43);
  assert.equal(createdTabCount, 0);
});

test("capture does not require Chrome to expose the tab URL", async () => {
  const before = Object.keys(values).length;
  await actionListener({ id: 44 });
  assert.equal(openedPanelTabId, 44);
  assert.equal(Object.keys(values).length, before + 1);
});

test("the side panel can request capture of the active job", async () => {
  const before = Object.keys(values).length;
  const response = await new Promise((resolve) => {
    assert.equal(messageListener({ type: "jobhazel.capture.active" }, {}, resolve), true);
  });
  assert.deepEqual(response, { ok: true });
  assert.equal(Object.keys(values).length, before + 1);
  assert.equal(createdTabCount, 0);
});
