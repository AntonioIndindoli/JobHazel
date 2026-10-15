import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { readPageContext } from "../dist/production/page-context.js";
import { buildJobCapture } from "../dist/production/capture.js";
import { parseJobDescriptionWithFetch } from "../../backend/src/services/parser.services.js";

// Requires both extension and backend dependencies. Runs entirely on a fixture;
// it creates no drafts and must not fetch LinkedIn or transmit account data.
for (const expected of [
  { file: "linkedin.html", id: "9876543210", title: "Staff Software Engineer", company: "Hazel Labs", location: "Seattle, WA", salaryMin: 145000, salaryMax: 185000, description: /mentoring engineers/, skills: ["PostgreSQL", "Python", "React"] },
  { file: "linkedin-sdui.html", id: "4446745306", title: "Software Engineer, New Grad", company: "Nooks", location: "San Francisco, CA", salaryMin: 200000, description: /Design, build, and ship full-stack features/, skills: ["React", "TypeScript", "Python"] },
]) {
  const html = await readFile(new URL(`../tests/fixtures/${expected.file}`, import.meta.url), "utf8");
  const dom = new JSDOM(html, {
    url: `https://www.linkedin.com/jobs/search-results/?currentJobId=${expected.id}`,
    runScripts: "outside-only",
  });
  dom.window.Element.prototype.getClientRects = () => [{ width: 400, height: 100 }];
  try {
    const context = await dom.window.eval(`(${readPageContext.toString()})(0)`);
    assert.equal(context.error, undefined);
    const captured = buildJobCapture(context, "123e4567-e89b-42d3-a456-426614174000");
    const parsed = await parseJobDescriptionWithFetch(captured);
    assert.equal(parsed.fetchResult.attempted, false, "Captured job text must bypass server-side URL fetching.");
    assert.equal(parsed.parsedTitle, expected.title);
    assert.equal(parsed.parsedCompany, expected.company);
    assert.equal(parsed.parsedLocation, expected.location);
    assert.equal(parsed.parsedSalaryMin, expected.salaryMin);
    if (expected.salaryMax !== undefined) assert.equal(parsed.parsedSalaryMax, expected.salaryMax);
    assert.equal(parsed.source, "LinkedIn");
    assert.equal(parsed.sourceUrl, `https://www.linkedin.com/jobs/view/${expected.id}`);
    assert.match(parsed.parsedDescription, expected.description);
    assert.doesNotMatch(parsed.parsedDescription, /Wrong Employer|Sales Manager|Private Person|private-/i);
    for (const skill of expected.skills) assert.ok(parsed.skills.includes(skill), `Missing ${skill}`);
    console.log(`${expected.file}: capture → parser verified for ${expected.company}: title, company, location, salary, full description, skills, and job URL. No URL fetch.`);
  } finally { dom.window.close(); }
}
