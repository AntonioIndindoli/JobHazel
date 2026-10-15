import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { fillApplication, normalizeProfile } from "../dist/production/autofill.js";

function page(html) {
  const dom = new JSDOM(html, { runScripts: "outside-only" });
  dom.window.HTMLElement.prototype.getClientRects = () => [{ width: 100, height: 30 }];
  const fill = dom.window.eval(`(${fillApplication.toString()})`);
  return { document: dom.window.document, window: dom.window, fill: (profile) => JSON.parse(JSON.stringify(fill(normalizeProfile(profile)))) };
}

test("fills native contact fields by labels, ARIA, attributes, and exact select option text", () => {
  const { document, fill } = page(`<form>
    <label>First name *<input id="first"></label><label for="last">Last name (required)</label><input id="last">
    <span id="email-label">Email address</span><input id="email" aria-labelledby="email-label">
    <input id="phone" aria-label="Phone number"><input id="street" autocomplete="shipping address-line1">
    <input id="city" name="city"><input id="zip" placeholder="Postal code">
    <label>Country<select id="country"><option value="">Select</option><option value="US">United States</option></select></label>
    <label>LinkedIn profile<input id="linkedin"></label><label>Portfolio URL<input id="portfolio"></label>
    <button type="submit">Apply</button></form>`);
  let submitted = false;
  document.querySelector("form").addEventListener("submit", () => { submitted = true; });
  const result = fill({ firstName: "Hazel", lastName: "Jones", email: "hazel@example.com", phone: "5551234567", address: "12 Main St", city: "Oakland", postalCode: "94612", country: "United States", linkedin: "https://linkedin.com/in/hazel", website: "https://example.com" });
  assert.equal(result.filled, 10);
  assert.equal(document.querySelector("#country").value, "US");
  assert.equal(document.querySelector("#last").value, "Jones");
  assert.equal(submitted, false);
});

test("keeps existing values and skips hidden, disabled, sensitive, and unrelated inputs", () => {
  const { document, fill } = page(`<input aria-label="Email" value="existing@example.com">
    <input aria-label="First name" disabled><fieldset disabled><input aria-label="Last name"></fieldset>
    <input aria-label="Phone" readonly><div hidden><input aria-label="City"></div>
    <div style="display:none"><input aria-label="City"></div><input type="hidden" name="email">
    <input type="file" name="resume"><input type="checkbox" name="consent"><input type="radio" name="gender">
    <label>Reference name<input name="name" autocomplete="name"></label>
    <label>Are you authorized to work?<input name="country" autocomplete="country"></label>
    <label>Why do you want this role?<textarea name="name"></textarea></label>
    <input role="combobox" aria-label="Country"><form><input type="password"><input name="email"></form>`);
  const result = fill({ fullName: "Hazel Jones", email: "new@example.com", firstName: "Hazel", lastName: "Jones", city: "Oakland", country: "US", phone: "123" });
  assert.deepEqual(result, { filled: 0, preserved: 1, missing: 0 });
  assert.equal(document.querySelector("input").value, "existing@example.com");
  for (const field of [...document.querySelectorAll("input,textarea")].slice(1)) {
    if (!["checkbox", "radio"].includes(field.type)) assert.equal(field.value, "");
  }
});

test("uses native setters and notifies controlled fields, including open shadow roots", () => {
  const { document, window, fill } = page('<input name="firstName"><div id="host"></div>');
  const input = document.querySelector("input");
  Object.defineProperty(input, "value", { get() { return Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").get.call(this); }, set() { throw new Error("Own setter must be bypassed"); } });
  const events = [];
  input.addEventListener("input", (event) => events.push([event.type, event.bubbles, input.value]));
  input.addEventListener("change", (event) => events.push([event.type, event.bubbles, input.value]));
  const root = document.querySelector("#host").attachShadow({ mode: "open" });
  root.innerHTML = '<label>Email<input></label>';
  assert.equal(fill({ firstName: "Hazel", email: "hazel@example.com" }).filled, 2);
  assert.deepEqual(events, [["input", true, "Hazel"], ["change", true, "Hazel"]]);
  assert.equal(root.querySelector("input").value, "hazel@example.com");
  assert.equal(fill({ firstName: "Other", email: "other@example.com" }).preserved, 2);
});

test("does not guess dropdown values, truncate data, or invent missing answers", () => {
  const { document, fill } = page(`<label>Country<select><option value="">Choose</option><option value="CA">Canada</option></select></label>
    <input name="firstName" maxlength="2"><input name="lastName"><input name="city">`);
  assert.deepEqual(fill({ country: "United States", firstName: "Hazel", city: "Oakland" }), { filled: 1, preserved: 0, missing: 3 });
  assert.equal(document.querySelector("select").value, "");
});

test("normalizes only allowlisted profile data and caps storage and injection values", () => {
  const profile = normalizeProfile({ email: " hazel@example.com ", fullName: "a".repeat(600), phone: 555, accessToken: "secret" });
  assert.equal(profile.email, "hazel@example.com");
  assert.equal(profile.fullName.length, 500);
  assert.equal(profile.phone, "");
  assert.equal(profile.accessToken, undefined);
  assert.equal(normalizeProfile(null).email, "");
});
