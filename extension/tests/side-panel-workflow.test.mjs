import assert from "node:assert/strict";
import test from "node:test";

// Minimal DOM surface used by the panel; element/HTML coverage lives in side-panel.test.
const nodes = new Map();
function node(id) {
  if (nodes.has(id)) return nodes.get(id);
  const classes = new Set();
  const listeners = new Map();
  const value = {
    value: "", checked: false, disabled: false, textContent: "", dataset: {}, className: "",
    classList: {
      toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
      remove(name) { classes.delete(name); },
      add(name) { classes.add(name); },
      contains(name) { return classes.has(name); },
    },
    addEventListener(type, listener) { listeners.set(type, listener); },
    querySelector() { return node(`${id}-submit`); },
    replaceChildren(...children) { value.children = children; value.value = children[0]?.value ?? ""; },
    dispatch(type) { listeners.get(type)?.({ preventDefault() {}, currentTarget: value }); },
  };
  nodes.set(id, value);
  return value;
}
globalThis.document = { getElementById: node, createElement: () => ({ value: "", textContent: "" }) };
const captures = {};
const sessions = {};
let storageListener;
globalThis.chrome = {
  storage: {
    local: {
      get: async (key) => ({ [key]: sessions[key] }),
      set: async (entries) => Object.assign(sessions, entries),
      remove: async (key) => { delete sessions[key]; },
    },
    session: {
      get: async () => ({ ...captures }),
      remove: async (key) => {
        delete captures[key];
        storageListener?.({ [key]: {} }, "session");
      },
    },
    onChanged: { addListener: (listener) => { storageListener = listener; } },
  },
  tabs: { create: async () => ({}) },
  windows: { getCurrent: async () => ({ id: 7 }) },
  runtime: { sendMessage: async (message) => {
    assert.equal(message.windowId, 7);
    return { ok: true };
  } },
};
const session = {
  accessToken: "access", refreshToken: "refresh", refreshTokenExpiresAt: "2030-01-01T00:00:00Z",
  user: { id: "user", email: "test@example.com", name: "Test" },
};
sessions["jobhazel.extension-session.v2:https://api.jobhazel.com"] = session;
let draftRequests = 0;
const draftCaptureIds = [];
let saveRequests = 0;
const savedValues = [];
let failResumes = true;
let failDraft = true;
let saveResult;
let releaseDraft;
globalThis.fetch = async (url, init) => {
  if (url.endsWith("/resumes")) {
    if (failResumes) throw new TypeError("offline");
    return Response.json({ resumes: [
      { id: "resume-ready", name: "Engineering resume", targetRole: "Engineer", uploadStatus: "READY", archivedAt: null },
      { id: "resume-pending", name: "Incomplete resume", uploadStatus: "PENDING", archivedAt: null },
      { id: "resume-archived", name: "Old resume", uploadStatus: "READY", archivedAt: "2025-01-01" },
    ] });
  }
  if (url.endsWith("/auth/extension/refresh")) return Response.json(session);
  if (url.endsWith("/imports/create-draft")) {
    draftRequests++;
    draftCaptureIds.push(init.headers["Idempotency-Key"]);
    if (failDraft) throw new TypeError("offline");
    if (releaseDraft) await releaseDraft;
    return Response.json({ importDraft: {
      id: "draft", parsedTitle: "Engineer", sourceUrl: "https://jobs.example.com/role",
    }, duplicateCandidates: [] });
  }
  if (url.endsWith("/convert")) {
    saveRequests++;
    savedValues.push(JSON.parse(init.body));
    return saveResult ?? Response.json({ application: { id: "application", title: "Engineer", companyName: "Acme" } });
  }
  throw new Error(`Unexpected request: ${url}`);
};
function addCapture(id) {
  const key = `jobhazel.capture.${id}`;
  captures[key] = { capture: {
    version: 1, captureId: id, createdAt: Date.now(), sourceUrl: "https://jobs.example.com/role",
    sourceDomain: "jobs.example.com", pageTitle: "Engineer", rawText: "Description", warnings: [],
  }, expiresAt: Date.now() + 100_000 };
  return key;
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function settle(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await tick();
  }
  assert.fail("Panel did not reach expected state");
}
function visible(view) { return !node(`${view}-view`).classList.contains("hidden"); }

test("production panel keeps retry controls, serializes capture/save, and recovers expired sessions", async () => {
  const firstKey = addCapture("123e4567-e89b-42d3-a456-426614174000");
  await import("../dist/production/side-panel.js");
  await settle(() => visible("ready") && node("capture-error").textContent);
  assert.match(node("environment-label").textContent, /jobhazel.com/);
  assert.match(node("capture-error").textContent, /connection/);

  failDraft = false;
  let resolveDraft;
  releaseDraft = new Promise((resolve) => { resolveDraft = resolve; });
  node("capture-job").dispatch("click");
  await settle(() => visible("working"));
  const count = draftRequests;
  const secondKey = addCapture("123e4567-e89b-42d3-a456-426614174001");
  storageListener({ [secondKey]: { newValue: captures[secondKey] } }, "session");
  await tick();
  assert.equal(draftRequests, count, "A capture arriving during an import must not replace its active draft");
  resolveDraft();
  releaseDraft = null;
  await settle(() => visible("review") && !node("resumeVersionId").disabled);
  assert.match(node("resume-error").textContent, /connection/);
  assert.equal(node("title").value, "Engineer");
  failResumes = false;
  node("retry-resumes").dispatch("click");
  await settle(() => !node("resumeVersionId").disabled && !node("resume-error").textContent);
  assert.deepEqual(node("resumeVersionId").children.map((option) => option.value), ["", "resume-ready"]);
  node("resumeVersionId").value = "resume-ready";
  node("review-form").dispatch("submit");
  node("review-form").dispatch("submit");
  await settle(() => visible("review") && !captures[firstKey] && !node("review-form-submit").disabled);
  assert.equal(saveRequests, 1);
  assert.equal(savedValues[0].resumeVersionId, "resume-ready");
  await settle(() => !node("resumeVersionId").disabled);
  assert.equal(node("resumeVersionId").value, "", "A new draft must not inherit the previous job's resume");
  assert.equal(captures[firstKey], undefined);
  assert.ok(captures[secondKey], "Saving removes the capture belonging to that draft only");
  assert.equal(draftCaptureIds.at(-1), "123e4567-e89b-42d3-a456-426614174001",
    "After saving, an explicitly queued new posting is reviewed without reopening the panel");
  saveResult = Response.json({ message: "expired" }, { status: 401 });
  // Both the first send and retry receive 401.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url, init) => url.endsWith("/convert")
    ? Promise.resolve(Response.json({ message: "expired" }, { status: 401 })) : originalFetch(url, init);
  node("review-form").dispatch("submit");
  await settle(() => visible("login"));
  assert.ok(captures[secondKey]);
  assert.match(node("login-error").textContent, /session expired/);
  await settle(() => !node("review-form-submit").disabled);
  assert.equal(sessions["jobhazel.extension-session.v2:https://api.jobhazel.com"], undefined);

  // A save may commit even when its response is lost. Retrying that draft must
  // show success, rather than leave the user stuck on a permanent 409.
  globalThis.fetch = (url, init) => url.endsWith("/auth/extension/login")
    ? Promise.resolve(Response.json(session)) : originalFetch(url, init);
  node("email").value = session.user.email;
  node("password").value = "password123";
  node("login-form").dispatch("submit");
  await settle(() => visible("review") && !node("resumeVersionId").disabled);
  await settle(() => !node("login-form-submit").disabled);
  saveResult = Response.json({ message: "Import draft already converted.", importDraft: { id: "draft", convertedAt: "2026-10-08T00:00:00Z" } }, { status: 409 });
  node("review-form").dispatch("submit");
  await settle(() => visible("saved"));
  assert.equal(node("saved-title").textContent, "Application already saved");
  assert.equal(captures[secondKey], undefined);

  // A newly stored capture must be reviewed while the panel remains open
  // on its previous success screen.
  saveResult = null;
  const thirdKey = addCapture("123e4567-e89b-42d3-a456-426614174002");
  storageListener({ [thirdKey]: { newValue: captures[thirdKey] } }, "session");
  await settle(() => visible("review") && !node("resumeVersionId").disabled);
  assert.ok(captures[thirdKey]);
  assert.equal(node("title").value, "Engineer");

  const expiredKey = addCapture("123e4567-e89b-42d3-a456-426614174003");
  captures[expiredKey].expiresAt = Date.now() - 1;
  storageListener({ [expiredKey]: { newValue: captures[expiredKey] } }, "session");
  node("cancel-review").dispatch("click");
  await settle(() => visible("ready") && !captures[thirdKey]);
  await tick();
  assert.ok(visible("ready"), "An expired queued capture must leave the panel usable");
});
