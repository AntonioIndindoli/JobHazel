import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { setupAutofillPanel } from "../dist/production/autofill-panel.js";

test("panel seeds account details, persists edits, fills active page, isolates accounts, and clears profile", async () => {
  const html = await readFile(new URL("../dist/production/side-panel.html", import.meta.url), "utf8");
  const dom = new JSDOM(html);
  globalThis.document = dom.window.document;
  const stored = {};
  const messages = [];
  let failure = false;
  globalThis.chrome = {
    storage: { local: {
      get: async (key) => ({ [key]: stored[key] }),
      set: async (entries) => Object.assign(stored, entries),
      remove: async (key) => { delete stored[key]; },
    } },
    windows: { getCurrent: async () => ({ id: 9 }) },
    runtime: { sendMessage: async (message) => {
      messages.push(message);
      return failure ? { ok: false, message: "Page access blocked" } : { ok: true, result: { filled: 3, preserved: 2, missing: 1 } };
    } },
  };
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  const node = (id) => document.getElementById(id);
  const submit = () => node("autofill-form").dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  const setUser = setupAutofillPanel();
  const user = { id: "one", name: "Hazel Jones", email: "hazel@example.com" };
  setUser(user); await tick();
  assert.equal(node("autofill-fullName").value, user.name);
  assert.equal(node("autofill-email").value, user.email);
  node("autofill-firstName").value = "Hazel";
  submit(); submit(); await tick();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "jobhazel.autofill.active");
  assert.equal(messages[0].windowId, 9);
  assert.equal(messages[0].profile.firstName, "Hazel");
  assert.match(node("autofill-status").textContent, /Filled 3 fields.*2 existing answers kept.*1 fields need manual input/);
  assert.equal(Object.keys(stored).length, 1);
  failure = true; submit(); await tick();
  assert.match(node("autofill-status").textContent, /Page access blocked/);
  assert.equal(node("autofill-current").disabled, false);
  setUser(null);
  assert.equal(node("autofill-card").classList.contains("hidden"), true);
  assert.equal(node("autofill-email").value, "");
  setUser({ id: "two", email: "two@example.com", name: "Second" }); await tick();
  assert.equal(node("autofill-firstName").value, "");
  setUser(user); await tick();
  assert.equal(node("autofill-firstName").value, "Hazel");
  node("autofill-clear").click(); await tick();
  assert.equal(Object.keys(stored).length, 0);
  assert.equal(node("autofill-email").value, "");
  submit(); await tick();
  assert.match(node("autofill-status").textContent, /Add your contact details/);
  delete globalThis.document; delete globalThis.chrome;
});
