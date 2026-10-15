import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

const values = {};
let actionListener;
let messageListener;
let openedPanelTabId;
let createdTabCount = 0;
let activeTab = { id: 42, windowId: 7, url: "https://jobs.example.com/role/7" };
let lastQuery;
let scriptError = null;
let emptyInjection = false;
let pageContextError = null;
let permissionCalls = 0;
let lastInjection;
const injectedTabIds = [];

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
    id: "extension-id",
    getURL: (path) => `chrome-extension://extension-id/${path}`,
    onMessage: { addListener: (listener) => { messageListener = listener; } },
  },
  permissions: new Proxy({}, { get() {
    permissionCalls += 1;
    throw new Error("Capture must not use runtime permission requests");
  } }),
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
    executeScript: async (request) => {
      lastInjection = request;
      const { target } = request;
      injectedTabIds.push(target.tabId);
      if (target.tabId === 43) throw new Error("Cannot access a chrome:// URL");
      if (scriptError) throw scriptError;
      if (emptyInjection) return [];
      if (request.func.name === "fillApplication") return [
        { result: { filled: 2, preserved: 1, missing: 0 } },
        { result: { filled: 1, preserved: 0, missing: 1 } },
      ];
      if (pageContextError) return [{ result: { error: pageContextError } }];
      return [{ result: {
        sourceUrl: target.tabId === activeTab?.id ? activeTab.url : "https://jobs.example.com/role/7",
        pageTitle: "Frontend Engineer",
        rawText: "Build useful products.",
      } }];
    },
  },
  tabs: {
    query: async (query) => { lastQuery = query; return [activeTab]; },
    create: async () => { createdTabCount += 1; return { id: 99 }; },
  },
};

await import("../dist/development/service-worker.js");

beforeEach(() => {
  for (const key of Object.keys(values)) delete values[key];
  activeTab = { id: 42, windowId: 7, url: "https://jobs.example.com/role/7" };
  scriptError = null;
  emptyInjection = false;
  pageContextError = null;
  permissionCalls = 0;
  injectedTabIds.length = 0;
  openedPanelTabId = undefined;
});

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
  assert.equal(injectedTabIds.length, 0);
  assert.equal(permissionCalls, 0);
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
    assert.equal(messageListener({ type: "jobhazel.capture.active", windowId: 7 }, {}, resolve), true);
  });
  assert.deepEqual(response, { ok: true });
  assert.equal(Object.keys(values).length, before + 1);
  assert.equal(createdTabCount, 0);
  assert.deepEqual(lastQuery, { active: true, windowId: 7 });
});

const sendCapture = () => new Promise((resolve) => {
  messageListener({ type: "jobhazel.capture.active", windowId: 7 }, {}, resolve);
});
const captures = () => Object.values(values).map((record) => record.capture);

test("the open panel captures successive sites after navigation without a toolbar click", async () => {
  assert.deepEqual(await sendCapture(), { ok: true });
  activeTab.url = "https://careers.another.example/jobs/123";
  assert.deepEqual(await sendCapture(), { ok: true });
  assert.deepEqual(captures().map((capture) => capture.sourceUrl), [
    "https://jobs.example.com/role/7", "https://careers.another.example/jobs/123",
  ]);
  assert.equal(openedPanelTabId, undefined);
  assert.deepEqual(injectedTabIds, [42, 42]);
  assert.equal(permissionCalls, 0);
});

test("switching tabs captures the new posting on HTTP or HTTPS without a permission prompt", async () => {
  assert.deepEqual(await sendCapture(), { ok: true });
  activeTab = { id: 99, windowId: 7, url: "http://careers.example.org/posting/8" };
  assert.deepEqual(await sendCapture(), { ok: true });
  assert.equal(captures().at(-1).sourceUrl, activeTab.url);
  assert.deepEqual(injectedTabIds, [42, 99]);
  assert.equal(openedPanelTabId, undefined);
  assert.equal(createdTabCount, 0);
  assert.equal(permissionCalls, 0);
});

test("withheld website access gives settings guidance and can be retried from the same panel", async () => {
  scriptError = new Error('Cannot access contents of url "https://jobs.example.com/role/7". Extension manifest must request permission to access this host.');
  const response = await sendCapture();
  assert.equal(response.ok, false);
  assert.match(response.message, /Site access to On all sites/);
  assert.doesNotMatch(response.message, /address bar|toolbar|reload|close/i);
  assert.equal(captures().length, 0);
  scriptError = null;
  assert.deepEqual(await sendCapture(), { ok: true });
  assert.equal(captures().length, 1);
  assert.equal(permissionCalls, 0);
});

test("a loading page can be retried without reopening the panel", async () => {
  emptyInjection = true;
  const response = await sendCapture();
  assert.equal(response.ok, false);
  assert.match(response.message, /finish loading/);
  assert.equal(captures().length, 0);
  emptyInjection = false;
  assert.deepEqual(await sendCapture(), { ok: true });
  assert.equal(captures().length, 1);
  assert.equal(openedPanelTabId, undefined);
});

test("an unidentified LinkedIn detail panel shows its retry message without storing an incorrect capture", async () => {
  pageContextError = "JobHazel could not identify LinkedIn's selected job details. Wait for the right-hand job panel to finish loading, then capture it again.";
  const response = await sendCapture();
  assert.deepEqual(response, { ok: false, message: pageContextError });
  assert.equal(captures().length, 0);
  pageContextError = null;
  assert.deepEqual(await sendCapture(), { ok: true });
  assert.equal(captures().length, 1);
});

test("a Chrome page never asks for website access or creates a capture", async () => {
  activeTab = { id: 43, windowId: 7, url: "chrome://extensions" };
  const response = await sendCapture();
  assert.equal(response.ok, false);
  assert.match(response.message, /only HTTP and HTTPS job postings/);
  assert.equal(injectedTabIds.length, 0);
  assert.equal(captures().length, 0);
  assert.equal(permissionCalls, 0);
});

const panelSender = { id: "extension-id", url: "chrome-extension://extension-id/side-panel.html" };
const sendAutofill = () => new Promise((resolve) => {
  assert.equal(messageListener({ type: "jobhazel.autofill.active", windowId: 7, profile: { email: " test@example.com ", accessToken: "secret" } }, panelSender, resolve), true);
});

test("autofill targets the panel window, fills frames, sanitizes profile, and aggregates counts", async () => {
  assert.deepEqual(await sendAutofill(), { ok: true, result: { filled: 3, preserved: 1, missing: 1 } });
  assert.deepEqual(lastQuery, { active: true, windowId: 7 });
  assert.deepEqual(lastInjection.target, { tabId: 42, allFrames: true });
  assert.equal(lastInjection.args[0].email, "test@example.com");
  assert.equal(lastInjection.args[0].accessToken, undefined);
  assert.equal(captures().length, 0);
});

test("autofill rejects page senders and unsupported URLs and reports access failures", async () => {
  const message = { type: "jobhazel.autofill.active", profile: {} };
  for (const sender of [{}, { ...panelSender, tab: { id: 42 } }, { ...panelSender, url: "https://example.com" }]) {
    assert.equal(messageListener(message, sender, () => assert.fail("Untrusted sender accepted")), false);
  }
  assert.equal(injectedTabIds.length, 0);
  activeTab.url = "chrome://extensions";
  assert.equal((await sendAutofill()).ok, false);
  assert.equal(injectedTabIds.length, 0);
  activeTab.url = "https://example.com/apply";
  scriptError = new Error("Missing host permission");
  assert.match((await sendAutofill()).message, /Site access/);
  scriptError = null; emptyInjection = true;
  assert.match((await sendAutofill()).message, /still loading/);
});
