import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import axios from "axios";
import dns from "node:dns/promises";
import { extractJobPageDataFromHtml, parseJobDescription, parseJobDescriptionWithFetch } from "../services/parser.services.js";

// The user's rendered DOM, with executable scripts removed.
const html = await readFile(new URL("../../../extension/tests/fixtures/bytedance.html", import.meta.url), "utf8");
const sourceUrl = "https://joinbytedance.com/search/7174177312325126413";

function assertPosting(parsed) {
  assert.equal(parsed.parsedTitle, "Software Engineer, Unity Engine and XR");
  assert.equal(parsed.parsedCompany, "ByteDance");
  assert.equal(parsed.parsedLocation, "San Jose");
  assert.equal(parsed.parsedSalaryMin, 162000);
  assert.equal(parsed.parsedSalaryMax, 387600);
  assert.equal(parsed.source, "ByteDance");
  assert.equal(parsed.confidence, 1);
  assert.match(parsed.parsedDescription, /Write Unity engine or Unreal Engine extensions/);
  assert.match(parsed.parsedDescription, /Minimum Qualifications/);
  assert.match(parsed.parsedDescription, /Reasonable Accommodation/);
  assert.doesNotMatch(parsed.parsedDescription, /Our Culture|Privacy Policy|Share this listing|Apply to this job/);
}

function mockPage(t, body) {
  t.mock.method(dns, "lookup", async () => [{ address: "93.184.216.34", family: 4 }]);
  t.mock.method(axios, "get", async () => ({ status: 200, headers: { "content-type": "text/html" }, data: body }));
}

test("ByteDance URL imports extract the selected posting from the supplied DOM", async (t) => {
  mockPage(t, html);
  const parsed = await parseJobDescriptionWithFetch({ sourceUrl });
  assert.equal(parsed.fetchResult.success, true);
  assert.equal(parsed.sourceUrl, sourceUrl);
  assertPosting(parsed);
});

test("ByteDance streamed HTML can place navigation and the footer before the job", () => {
  const footer = html.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/i)?.[0] ?? "<footer>Privacy Policy</footer>";
  const streamed = html.replace(footer, "").replace(/<body\b[^>]*>/i, (tag) => `${tag}${footer}`);
  const page = extractJobPageDataFromHtml(streamed, sourceUrl);
  assertPosting(parseJobDescription({ ...page, sourceUrl }));
});

for (const [name, body] of [
  ["loading shell", "<title>ByteDance</title><menu>Locations Early Careers</menu><footer>Privacy Policy ByteDance</footer>"],
  ["stale job ID", html.replaceAll("7174177312325126413", "9999999999999999999")],
  ["incomplete description", html.replaceAll(">Qualifications<", ">Loading<")],
]) {
  test(`ByteDance ${name} does not import navigation or stale details`, async (t) => {
    mockPage(t, body);
    const parsed = await parseJobDescriptionWithFetch({ sourceUrl });
    assert.equal(parsed.fetchResult.success, false);
    assert.equal(parsed.parsedTitle, null);
    assert.equal(parsed.parsedLocation, null);
    assert.equal(parsed.parsedDescription, null);
    assert.match(parsed.fetchResult.error, /ByteDance job details/);
  });
}

test("ByteDance host recognition does not apply to lookalike domains", () => {
  const parsed = parseJobDescription({ sourceUrl: "https://joinbytedance.com.example.org/search/7174177312325126413" });
  assert.equal(parsed.source, null);
  assert.notEqual(parsed.parsedCompany, "ByteDance");
});
