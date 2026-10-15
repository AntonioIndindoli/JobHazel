import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import axios from "axios";
import dns from "node:dns/promises";
import { parseJobDescription, parseJobDescriptionWithFetch } from "../services/parser.services.js";

const job = JSON.parse(await readFile(new URL("./fixtures/careertakes.json", import.meta.url), "utf8"));
const originalUrl = `https://careertakes.ai/jobs/apply/?id=${job.id}&utm_source=Linkedin&utm_medium=paid-social`;
const dataUrl = `https://careertakes.ai/files/jobs/${job.id}.json`;
const shell = '<html><head><title>Apply | CareerTakes</title></head><body><header>Sign up to unlock more job matches Sign Up Log In</header><main></main><footer><p>Terms of Service | Privacy Policy</p><p>Edkey ©2026</p></footer></body></html>';

function mockFetch(t, response = job, contentType = "application/json") {
  t.mock.method(dns, "lookup", async () => [{ address: "93.184.216.34", family: 4 }]);
  const requests = [];
  t.mock.method(axios, "get", async (url, options) => {
    requests.push({ url, options });
    if (url === dataUrl) {
      if (response instanceof Error) throw response;
      return { status: 200, headers: { "content-type": contentType }, data: response };
    }
    return { status: 200, headers: { "content-type": "text/html" }, data: shell };
  });
  return requests;
}

test("CareerTakes URL import reads the selected public JSON instead of the client shell", async (t) => {
  const requests = mockFetch(t);
  const parsed = await parseJobDescriptionWithFetch({ sourceUrl: originalUrl, pageTitle: "Apply | CareerTakes" });
  assert.deepEqual(requests.map(({ url }) => url), [originalUrl, dataUrl]);
  assert.equal(requests[1].options.maxRedirects, 0);
  assert.equal(parsed.sourceUrl, `https://careertakes.ai/jobs/apply?id=${job.id}`);
  assert.equal(parsed.source, "CareerTakes");
  assert.equal(parsed.parsedTitle, "Software Engineer 1");
  assert.equal(parsed.parsedCompany, "Confidential Client");
  assert.equal(parsed.parsedLocation, "Campbell, California");
  assert.equal(parsed.parsedSalaryMin, 111883);
  assert.equal(parsed.parsedSalaryMax, 111883);
  assert.match(parsed.parsedDescription, /Participate in code reviews/);
  assert.doesNotMatch(parsed.parsedDescription, /Privacy Policy|Edkey|Sign up to unlock/);
  assert.ok(parsed.skills.includes("Java"));
  assert.ok(parsed.skills.includes("TypeScript"));
  assert.equal(parsed.fetchResult.jobDataUrl, dataUrl);
});

test("footer and signup text cannot become a title, employer, or high-confidence description", () => {
  const parsed = parseJobDescription({
    sourceUrl: originalUrl, pageTitle: "Apply | CareerTakes",
    rawText: "Apply | CareerTakes\nSign up to unlock more job matches Sign Up Log In\nTerms of Service | Privacy Policy\nEdkey ©2026",
  });
  assert.equal(parsed.parsedTitle, null);
  assert.equal(parsed.parsedCompany, null);
  assert.equal(parsed.parsedDescription, "");
  assert.equal(parsed.confidence, 0.1);
});

for (const [name, response, type] of [
  ["missing posting", new Error("Request failed with status code 404"), "application/json"],
  ["wrong posting", { ...job, id: "another-job" }, "application/json"],
  ["HTML response", shell, "text/html"],
  ["missing description", { id: job.id, title: job.title }, "application/json"],
]) {
  test(`CareerTakes ${name} leaves fields empty instead of parsing the footer`, async (t) => {
    mockFetch(t, response, type);
    const parsed = await parseJobDescriptionWithFetch({ sourceUrl: originalUrl, pageTitle: "Apply | CareerTakes" });
    assert.equal(parsed.fetchResult.success, false);
    assert.equal(parsed.parsedTitle, null);
    assert.equal(parsed.parsedCompany, null);
    assert.equal(parsed.parsedDescription, null);
    assert.equal(parsed.confidence, 0.1);
  });
}

for (const url of [
  "https://careertakes.ai.example.org/jobs/apply/?id=abc",
  "https://careertakes.ai/jobs/apply/?id=..%2Fsecret",
  "https://careertakes.ai/jobs/apply/",
  "https://careertakes.ai/login?id=abc",
]) {
  test(`public job lookup is restricted to exact host, route, and safe ID: ${url}`, async (t) => {
    const requests = mockFetch(t);
    await parseJobDescriptionWithFetch({ sourceUrl: url });
    assert.equal(requests.length, 1);
  });
}
