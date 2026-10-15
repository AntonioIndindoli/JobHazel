import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { readPageContext } from "../dist/production/page-context.js";
import { buildJobCapture } from "../dist/production/capture.js";
import { parseJobDescriptionWithFetch } from "../../backend/src/services/parser.services.js";

// Offline integration check using the user's rendered HTML. Requires both
// extension and backend dependencies; creates no drafts or applications.
const html = await readFile(new URL("../tests/fixtures/careertakes.html", import.meta.url), "utf8");
const dom = new JSDOM(html, {
  url: "https://careertakes.ai/jobs/apply/?id=G9RmL7B5sd545672X7mMCh&utm_source=Linkedin&utm_medium=paid-social",
  runScripts: "outside-only",
});
dom.window.Element.prototype.getClientRects = () => [{ width: 400, height: 100 }];
try {
  const context = await dom.window.eval(`(${readPageContext.toString()})(0)`);
  assert.equal(context.error, undefined);
  const captured = buildJobCapture(context, "123e4567-e89b-42d3-a456-426614174000");
  const parsed = await parseJobDescriptionWithFetch(captured);
  assert.equal(parsed.fetchResult.attempted, false);
  assert.equal(parsed.parsedTitle, "Software Engineer 1");
  assert.equal(parsed.parsedCompany, "Confidential Client");
  assert.equal(parsed.parsedLocation, "Campbell, California");
  assert.equal(parsed.parsedSalaryMin, 111883);
  assert.equal(parsed.source, "CareerTakes");
  assert.equal(parsed.sourceUrl, "https://careertakes.ai/jobs/apply?id=G9RmL7B5sd545672X7mMCh");
  assert.match(parsed.parsedDescription, /Participate in code reviews/);
  assert.match(parsed.parsedDescription, /Equal Opportunity & Hiring Transparency/);
  assert.doesNotMatch(parsed.parsedDescription, /Privacy Policy|Edkey|Sign up to unlock|Unlock Match Rate/);
  for (const skill of ["Java", "React", "TypeScript"]) assert.ok(parsed.skills.includes(skill));
  console.log("CareerTakes capture → parser verified: selected job, employer, location, salary estimate, full description, skills, and URL. No URL fetch.");
} finally { dom.window.close(); }
