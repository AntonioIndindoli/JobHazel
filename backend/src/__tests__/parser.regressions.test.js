import assert from "node:assert/strict";
import test from "node:test";
import axios from "axios";
import dns from "node:dns/promises";
import { normalizeUrl } from "../utils/url.js";
import { extractJobPageDataFromHtml, parseJobDescription, parseJobDescriptionWithFetch } from "../services/parser.services.js";
import { validateCreateDraftPayload } from "../validators/import.validators.js";
import { applicationJob, structuredJob, description, jobPage, jobUrls } from "./fixtures/job-import.js";

for (const [site, base, key, value] of jobUrls) {
  test(`URL identity survives normalization and validation: ${site}`, () => {
    const url = new URL(base);
    url.searchParams.set(key, value);
    url.searchParams.set("utm_source", "newsletter");
    url.searchParams.set("GCLID", "tracking");
    url.hash = "apply";
    const normalized = normalizeUrl(url.href);
    const parsed = new URL(normalized);
    assert.equal(parsed.searchParams.get(key), value);
    assert.equal(parsed.searchParams.has("utm_source"), false);
    assert.equal(parsed.searchParams.has("GCLID"), false);
    assert.equal(parsed.hash, "");
    assert.equal(normalizeUrl(normalized), normalized);
    const other = new URL(url);
    other.searchParams.set(key, `${value}-different`);
    assert.notEqual(normalizeUrl(other.href), normalized);
    const req = { body: { sourceUrl: url.href }, get: () => undefined };
    validateCreateDraftPayload(req, { status: () => { throw Error("unexpected rejection"); } }, () => {});
    assert.equal(req.validatedImportDraft.sourceUrl, normalized);
    assert.equal(req.validatedImportDraft.fetchUrl, url.href);
    assert.equal(parseJobDescription({ sourceUrl: normalized }).sourceUrl, normalized);
  });
}

test("URL normalization preserves repeated, blank, case-sensitive, and encoded identity parameters", () => {
  const normalized = normalizeUrl("https://EXAMPLE.com:443/job/?tag=a&tag=b&empty=&JobID=A%2FB%2BC&UTM_MEDIUM=email#top");
  assert.equal(normalized, "https://example.com/job?JobID=A%2FB%2BC&empty=&tag=a&tag=b");
  assert.equal(normalizeUrl("https://example.com/job?b=2&a=1"), normalizeUrl("https://example.com/job?a=1&b=2"));
});

// Every combination of present/missing fields exercises precedence independently.
const keys = ["title", "hiringOrganization", "jobLocation", "baseSalary", "description"];
for (let mask = 0; mask < 32; mask++) {
  for (const missing of [null, ""]) {
    test(`partial JSON-LD merges application fields: mask=${mask}, missing=${JSON.stringify(missing)}`, () => {
      const ld = { "@type": "JobPosting" };
      keys.forEach((key, index) => { ld[key] = mask & (1 << index) ? structuredJob[key] : missing; });
      const extracted = extractJobPageDataFromHtml(jobPage({ ld, app: applicationJob }));
      assert.equal(extracted.structured.title, applicationJob.title);
      assert.equal(extracted.structured.company, applicationJob.companyName);
      assert.equal(extracted.structured.location, applicationJob.location);
      assert.equal(extracted.structured.salary, "Salary: USD 150000 - 190000");
      assert.equal(extracted.structured.description, description);
      const parsed = parseJobDescription({ ...extracted, fetchResult: { success: true, structured: extracted.structured } });
      assert.equal(parsed.parsedCompany, applicationJob.companyName);
      assert.equal(parsed.parsedLocation, applicationJob.location);
      assert.equal(parsed.parsedSalaryMin, 150000);
      assert.equal(parsed.parsedSalaryMax, 190000);
      assert.deepEqual([...parsed.skills].sort(), ["PostgreSQL", "Python", "React"]);
    });
  }
}

test("JSON-LD wins conflicts, while empty fields use compatible application data", () => {
  const extracted = extractJobPageDataFromHtml(jobPage({
    ld: { ...structuredJob, hiringOrganization: { name: "Authoritative Employer" }, description: "" },
    app: applicationJob,
  }));
  assert.equal(extracted.structured.company, "Authoritative Employer");
  assert.equal(extracted.structured.description, description);
});

test("related job application data cannot fill the selected posting", () => {
  const extracted = extractJobPageDataFromHtml(jobPage({
    ld: { "@type": "JobPosting", title: "Staff Software Engineer" },
    app: { ...applicationJob, title: "Sales Manager", companyName: "Wrong Employer" },
    body: `<h1>Staff Software Engineer</h1><p>Company: Correct Employer</p><p>Location: Seattle, WA</p><p>${description}</p>`,
  }));
  assert.equal(extracted.structured.company, "Correct Employer");
  assert.equal(extracted.structured.location, "Seattle, WA");
  assert.ok(!extracted.rawText.includes("Wrong Employer"));
  assert.ok(extracted.rawText.includes(description));
});

for (const attributes of ['TYPE = "APPLICATION/LD+JSON"', "data-test='job' type = 'application/ld+json'", 'type="application/ld+json" id="posting"']) {
  test(`JSON-LD tolerates script attribute variations: ${attributes}`, () => {
    assert.equal(extractJobPageDataFromHtml(jobPage({ ld: structuredJob, scriptAttributes: attributes })).structured.company, applicationJob.companyName);
  });
}

for (const ld of ["{broken json", { "@type": "Organization", name: "Site Owner" }, []]) {
  test(`invalid or unrelated JSON-LD falls back to embedded job: ${JSON.stringify(ld)}`, () => {
    assert.equal(extractJobPageDataFromHtml(jobPage({ ld, app: applicationJob })).structured.company, applicationJob.companyName);
  });
}

test("partial structured posting retains visible description and salary", () => {
  const extracted = extractJobPageDataFromHtml(jobPage({
    ld: { "@type": "JobPosting", title: "Staff Software Engineer", hiringOrganization: { name: "Fixture Labs" } },
    body: `<nav>Apply now</nav><main><p>${description}</p><p>Salary: $150,000 - $190,000</p></main>`,
  }));
  assert.ok(extracted.structured.description.includes(description));
  assert.equal(extracted.structured.salary, "Salary: USD 150000 - 190000");
});

test("metadata supplies a description when no visible text is available", () => {
  const extracted = extractJobPageDataFromHtml(jobPage({ ld: { "@type": "JobPosting", title: "Staff Software Engineer" }, head: `<meta name="description" content="${description}">` }));
  assert.equal(extracted.structured.description, description);
});

test("plain HTML remains a supported fallback", () => {
  const extracted = extractJobPageDataFromHtml(jobPage({ head: "<title>Staff Software Engineer</title>", body: `<h1>Staff Software Engineer</h1><p>Company: Fixture Labs</p><p>Location: Seattle, WA</p><p>${description}</p>` }));
  const parsed = parseJobDescription(extracted);
  assert.equal(parsed.parsedTitle, applicationJob.title);
  assert.equal(parsed.parsedCompany, applicationJob.companyName);
  assert.equal(parsed.parsedLocation, "Seattle, WA");
});

test("URL-only import keeps identity through fetch and uses merged fields in final result", async (t) => {
  const original = "https://careers.example.com/job?jk=abc123&utm_source=email";
  t.mock.method(dns, "lookup", async () => [{ address: "93.184.216.34", family: 4 }]);
  let fetched;
  t.mock.method(axios, "get", async (url) => {
    fetched = url;
    return { status: 200, headers: { "content-type": "text/html" }, data: jobPage({
      ld: { "@type": "JobPosting", title: applicationJob.title }, app: applicationJob,
    }) };
  });
  const parsed = await parseJobDescriptionWithFetch({ sourceUrl: original });
  assert.equal(fetched, original);
  assert.equal(parsed.sourceUrl, "https://careers.example.com/job?jk=abc123");
  assert.equal(parsed.parsedTitle, applicationJob.title);
  assert.equal(parsed.parsedCompany, applicationJob.companyName);
  assert.equal(parsed.parsedLocation, applicationJob.location);
  assert.equal(parsed.parsedSalaryMin, 150000);
  assert.equal(parsed.parsedSalaryMax, 190000);
  assert.ok(parsed.parsedDescription.includes(description));
});

for (const format of ["JSON-LD", "application JSON"]) {
  test(`${format} parses JSON before decoding HTML entities inside strings`, () => {
    const employer = 'Fixture &quot;Research&quot; &amp; Development';
    const extracted = extractJobPageDataFromHtml(jobPage(format === "JSON-LD"
      ? { ld: { ...structuredJob, hiringOrganization: { name: employer } } }
      : { app: { ...applicationJob, companyName: employer } }));
    assert.equal(extracted.structured.company, 'Fixture "Research" & Development');
  });
}

for (const [city, region, country] of [
  ["London", "England", "United Kingdom"], ["Berlin", "Berlin", "Germany"],
  ["Sydney", "NSW", "Australia"], ["Bengaluru", "Karnataka", "India"],
  ["São Paulo", "SP", "Brazil"], ["Montréal", "Québec", "Canada"],
  ["東京", "東京都", "日本"], ["Paris", "Île-de-France", "France"],
]) {
  test(`structured international location survives final parsing: ${city}`, () => {
    const extracted = extractJobPageDataFromHtml(jobPage({ ld: { ...structuredJob,
      jobLocation: { address: { addressLocality: city, addressRegion: region, addressCountry: country } },
    } }));
    const parsed = parseJobDescription({ ...extracted, fetchResult: { success: true, structured: extracted.structured } });
    assert.equal(parsed.parsedLocation, `${city}, ${region}, ${country}`);
  });
}

for (const [name, job] of [
  ["snake_case", { job_title: applicationJob.title, company_name: applicationJob.companyName, job_description: description }],
  ["position aliases", { positionName: applicationJob.title, employerName: applicationJob.companyName, description }],
  ["blank primary aliases", { title: "", jobTitle: applicationJob.title, company: null, companyName: applicationJob.companyName, description }],
  ["object-valued employer", { title: applicationJob.title, employer: { name: applicationJob.companyName }, description }],
]) {
  test(`embedded payload format: ${name}`, () => {
    const extracted = extractJobPageDataFromHtml(jobPage({ app: job }));
    assert.equal(extracted.structured.title, applicationJob.title);
    assert.equal(extracted.structured.company, applicationJob.companyName);
    assert.equal(extracted.structured.description, description);
  });
}
