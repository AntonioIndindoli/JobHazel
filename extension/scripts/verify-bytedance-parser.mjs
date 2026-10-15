import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { readPageContext } from "../dist/production/page-context.js";
import { buildJobCapture } from "../dist/production/capture.js";
import { parseJobDescriptionWithFetch } from "../../backend/src/services/parser.services.js";

// Offline capture → parser check using the user's rendered HTML; writes no data.
const html = await readFile(new URL("../tests/fixtures/bytedance.html", import.meta.url), "utf8");
const dom = new JSDOM(html, {
  url: "https://joinbytedance.com/search/7174177312325126413", runScripts: "outside-only",
});
dom.window.Element.prototype.getClientRects = () => [{ width: 400, height: 100 }];
try {
  const context = await dom.window.eval(`(${readPageContext.toString()})(0)`);
  assert.equal(context.error, undefined);
  const captured = buildJobCapture(context, "123e4567-e89b-42d3-a456-426614174000");
  assert.deepEqual(captured.warnings, []);
  const parsed = await parseJobDescriptionWithFetch(captured);
  assert.equal(parsed.fetchResult.attempted, false);
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
  console.log("ByteDance capture → parser verified: title, employer, San Jose, $162,000–$387,600 annual salary, complete description, and source. No URL fetch.");
} finally { dom.window.close(); }
