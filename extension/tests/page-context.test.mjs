import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { readPageContext } from "../dist/development/page-context.js";
import { buildJobCapture } from "../dist/development/capture.js";

const fixture = await readFile(new URL("./fixtures/linkedin.html", import.meta.url), "utf8");
const sduiFixture = await readFile(new URL("./fixtures/linkedin-sdui.html", import.meta.url), "utf8");
const careerTakesFixture = await readFile(new URL("./fixtures/careertakes.html", import.meta.url), "utf8");
const byteDanceFixture = await readFile(new URL("./fixtures/bytedance.html", import.meta.url), "utf8");
const byteDanceUrl = "https://joinbytedance.com/search/7174177312325126413";
const careerTakesUrl = "https://careertakes.ai/jobs/apply/?id=G9RmL7B5sd545672X7mMCh&utm_source=Linkedin&utm_medium=paid-social";
const sduiUrl = "https://www.linkedin.com/jobs/search-results/?currentJobId=4446745306";
const searchUrl = "https://www.linkedin.com/jobs/search/?keywords=engineer&currentJobId=9876543210";

function page(html = fixture, url = searchUrl) {
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  // jsdom does not perform layout. Simulate only whether an element has a box;
  // selectors, ancestor traversal, computed styles, and text use its real DOM.
  dom.window.Element.prototype.getClientRects = function () {
    for (let node = this; node; node = node.parentElement) {
      if (node.hidden || dom.window.getComputedStyle(node).display === "none") return [];
    }
    return [{ width: 400, height: 100 }];
  };
  return dom;
}

async function capture(dom, waitMs = 0) {
  // Execute the serialized function with page globals, exactly as Chrome does.
  // This catches helpers accidentally referencing extension module scope.
  const result = await dom.window.eval(`(${readPageContext.toString()})(${waitMs})`);
  return JSON.parse(JSON.stringify(result));
}

test("ByteDance captures the full posting without a text selection", async () => {
  const dom = page(byteDanceFixture, byteDanceUrl);
  try {
    const context = await capture(dom);
    assert.equal(context.sourceUrl, byteDanceUrl);
    assert.equal(context.pageTitle, "Software Engineer, Unity Engine and XR");
    assert.match(context.rawText, /Company: ByteDance\nLocation: San Jose/);
    assert.match(context.rawText, /Employment Type: Regular/);
    assert.match(context.rawText, /Write Unity engine or Unreal Engine extensions/);
    assert.match(context.rawText, /Minimum Qualifications/);
    assert.match(context.rawText, /\$162000 - \$387600 annually/);
    assert.match(context.rawText, /Reasonable Accommodation/);
    assert.doesNotMatch(context.rawText, /Our Culture|Privacy Policy|Share this listing|Apply to this job/);
    assert.deepEqual(buildJobCapture(context, "bytedance-job").warnings, []);
  } finally { dom.window.close(); }
});

test("ByteDance waits for the client-rendered posting", async () => {
  const dom = page("<title>ByteDance</title><main></main>", byteDanceUrl);
  try {
    dom.window.setTimeout(() => { dom.window.document.body.innerHTML = byteDanceFixture; }, 20);
    assert.equal((await capture(dom, 500)).pageTitle, "Software Engineer, Unity Engine and XR");
  } finally { dom.window.close(); }
});

test("ByteDance ignores missing, stale, hidden, busy, and incomplete postings", async () => {
  for (const state of ["missing", "stale", "hidden", "busy", "incomplete"]) {
    const dom = page(state === "missing" ? "<footer>Privacy Policy</footer>" : byteDanceFixture, byteDanceUrl);
    try {
      if (state === "stale") for (const el of dom.window.document.querySelectorAll('[data-tracking="job-apply-button"]')) el.setAttribute("tracking-value", "999");
      const title = dom.window.document.querySelector("h2");
      if (state === "hidden") title.closest('body > div').hidden = true;
      if (state === "busy") title.closest('body > div').setAttribute("aria-busy", "true");
      if (state === "incomplete") for (const el of dom.window.document.querySelectorAll(".bd-title")) el.remove();
      const context = await capture(dom);
      assert.match(context.error, /ByteDance posting/, state);
      assert.equal(context.rawText, undefined);
    } finally { dom.window.close(); }
  }
});

test("ByteDance navigation during capture requires a fresh capture", async () => {
  const dom = page(byteDanceFixture, byteDanceUrl);
  try {
    dom.window.setTimeout(() => dom.window.history.replaceState({}, "", "/search/999"), 20);
    assert.match((await capture(dom, 500)).error, /job changed during capture/);
  } finally { dom.window.close(); }
});

test("CareerTakes captures the user's rendered job card and complete description", async () => {
  const dom = page(careerTakesFixture, careerTakesUrl);
  try {
    const context = await capture(dom);
    assert.equal(context.sourceUrl, careerTakesUrl);
    assert.equal(context.pageTitle, "Software Engineer 1");
    assert.match(context.rawText, /Company: Confidential Client\nLocation: Campbell, California/);
    assert.match(context.rawText, /\$111,883/);
    assert.match(context.rawText, /Design, implement, test, and maintain software features/);
    assert.match(context.rawText, /Equal Opportunity & Hiring Transparency/);
    assert.doesNotMatch(context.rawText, /Privacy Policy|Edkey|Unlock Match Rate|View My Salary Range|Sign Up|Easy Apply/);
    assert.deepEqual(buildJobCapture(context, "careertakes-job").warnings, []);
  } finally { dom.window.close(); }
});

test("CareerTakes A/B module names and changed build suffixes retain capture support", async () => {
  const dom = page(careerTakesFixture.replaceAll("JobDetail_", "JobDetailB_").replaceAll("EL8Ha", "newBuild"), careerTakesUrl);
  try { assert.equal((await capture(dom)).pageTitle, "Software Engineer 1"); }
  finally { dom.window.close(); }
});

test("CareerTakes waits for client rendering before capturing", async () => {
  const dom = page("<title>Apply | CareerTakes</title><main></main>", careerTakesUrl);
  try {
    dom.window.setTimeout(() => {
      dom.window.document.body.innerHTML = careerTakesFixture;
    }, 20);
    assert.equal((await capture(dom, 500)).pageTitle, "Software Engineer 1");
  } finally { dom.window.close(); }
});

test("CareerTakes rejects missing, stale, hidden, and busy job cards", async () => {
  for (const state of ["missing", "stale", "hidden", "busy"]) {
    const dom = page(state === "missing" ? "<footer>Privacy Policy Edkey ©2026</footer>" : careerTakesFixture, careerTakesUrl);
    try {
      const card = dom.window.document.querySelector("[data-job-id]");
      if (state === "stale") card.setAttribute("data-job-id", "old-job");
      if (state === "hidden") card.hidden = true;
      if (state === "busy") card.setAttribute("aria-busy", "true");
      const context = await capture(dom);
      assert.match(context.error, /CareerTakes posting/);
      assert.equal(context.rawText, undefined);
    } finally { dom.window.close(); }
  }
});

test("CareerTakes navigation during capture requires a fresh capture", async () => {
  const dom = page(careerTakesFixture, careerTakesUrl);
  try {
    dom.window.setTimeout(() => dom.window.history.replaceState({}, "", "/jobs/apply/?id=another-job"), 20);
    assert.match((await capture(dom, 500)).error, /job changed during capture/);
  } finally { dom.window.close(); }
});

test("LinkedIn search captures the visible detail panel and canonical selected-job URL", async () => {
  const dom = page();
  try {
    const selection = dom.window.document.createRange();
    selection.selectNodeContents(dom.window.document.querySelector(".jobs-search-results-list"));
    dom.window.getSelection().addRange(selection);
    const context = await capture(dom);
    assert.equal(context.sourceUrl, "https://www.linkedin.com/jobs/view/9876543210/");
    assert.equal(context.pageTitle, "Staff Software Engineer");
    assert.match(context.rawText, /Company: Hazel Labs/);
    assert.match(context.rawText, /Location: Seattle, WA/);
    assert.match(context.rawText, /\$145,000 - \$185,000/);
    assert.match(context.rawText, /architecture, mentoring engineers/);
    assert.doesNotMatch(context.rawText, /Sales Manager|Wrong Employer|Data Analyst|Hidden old job|Private Person|private-|recruiter/i);
    const stored = buildJobCapture(context, "linkedin-job");
    assert.deepEqual(stored.warnings, []);
  } finally { dom.window.close(); }
});

test("selecting another job without a reload reads its new panel and keeps a distinct URL", async () => {
  const dom = page();
  try {
    const first = await capture(dom);
    dom.window.history.replaceState({}, "", "/jobs/search/?currentJobId=333");
    const titleLink = dom.window.document.querySelector("#selected-panel h1 a");
    titleLink.href = "/jobs/view/333/";
    titleLink.textContent = "Product Designer";
    dom.window.document.querySelector("#selected-panel #job-details").textContent = "Design accessible interfaces, interview customers, and improve the product experience.";
    const second = await capture(dom);
    assert.equal(second.sourceUrl, "https://www.linkedin.com/jobs/view/333/");
    assert.equal(second.pageTitle, "Product Designer");
    assert.match(second.rawText, /interview customers/);
    assert.doesNotMatch(second.rawText, /mentoring engineers/);
    assert.notEqual(first.sourceUrl, second.sourceUrl);
  } finally { dom.window.close(); }
});

test("capture waits when the search URL changes before LinkedIn replaces the previous panel", async () => {
  const dom = page(fixture, "https://www.linkedin.com/jobs/search/?currentJobId=333");
  try {
    dom.window.setTimeout(() => {
      const link = dom.window.document.querySelector("#selected-panel h1 a");
      link.href = "/jobs/view/333/";
      link.textContent = "Product Designer";
      dom.window.document.querySelector("#selected-panel #job-details").textContent = "Design accessible interfaces, interview customers, and improve the product experience.";
    }, 20);
    const context = await capture(dom, 500);
    assert.equal(context.pageTitle, "Product Designer");
    assert.equal(context.sourceUrl, "https://www.linkedin.com/jobs/view/333/");
    assert.doesNotMatch(context.rawText, /Staff Software Engineer|mentoring engineers/);
  } finally { dom.window.close(); }
});

test("a stale panel or busy panel returns a retry error instead of importing the wrong job", async () => {
  for (const busy of [false, true]) {
    const dom = page(fixture, busy ? searchUrl : "https://www.linkedin.com/jobs/search/?currentJobId=333");
    try {
      if (busy) dom.window.document.querySelector("#selected-panel").setAttribute("aria-busy", "true");
      const context = await capture(dom);
      assert.match(context.error, /right-hand job panel/);
      assert.equal(context.rawText, undefined);
      assert.equal(context.sourceUrl, undefined);
    } finally { dom.window.close(); }
  }
});

test("changing selection during a capture requires a fresh capture", async () => {
  const dom = page();
  try {
    dom.window.setTimeout(() => dom.window.history.replaceState({}, "", "/jobs/search/?currentJobId=333"), 20);
    const context = await capture(dom, 500);
    assert.match(context.error, /selected LinkedIn job changed/);
  } finally { dom.window.close(); }
});

test("older LinkedIn detail markup and standalone slug URLs capture the same posting", async () => {
  const dom = page(`<article class="job-view-layout">
    <h2 class="jobs-unified-top-card__job-title">Frontend Engineer</h2>
    <a class="jobs-unified-top-card__company-name" href="/company/acme/">Acme</a>
    <span class="jobs-unified-top-card__bullet">Austin, TX</span>
    <div class="jobs-description"><div class="jobs-box__html-content">Build useful products using React and collaborate with customers to improve accessibility.</div></div>
  </article>`, "https://www.linkedin.com/jobs/view/frontend-engineer-at-acme-444/?trackingId=abc");
  try {
    const context = await capture(dom);
    assert.equal(context.sourceUrl, "https://www.linkedin.com/jobs/view/444/");
    assert.equal(context.pageTitle, "Frontend Engineer");
    assert.match(context.rawText, /Company: Acme/);
    assert.match(context.rawText, /Location: Austin, TX/);
  } finally { dom.window.close(); }
});

test("semantic fallback uses a job heading and description when wrapper classes change", async () => {
  const dom = page(`<main><section>Sales Manager at Wrong Employer</section><article>
    <header><h1><a href="/jobs/view/555/">UX Designer</a></h1><a href="/company/acme/">Acme</a></header>
    <div><h2>About the job</h2><div id="job-details">Design accessible interfaces and work closely with researchers, customers, and engineers.</div></div>
  </article></main>`, "https://www.linkedin.com/jobs/collections/recommended/");
  try {
    const context = await capture(dom);
    assert.equal(context.pageTitle, "UX Designer");
    assert.equal(context.sourceUrl, "https://www.linkedin.com/jobs/view/555/");
    assert.doesNotMatch(context.rawText, /Wrong Employer/);
  } finally { dom.window.close(); }
});

test("missing detail content does not fall back to LinkedIn's list or browser title", async () => {
  const dom = page(`<title>Jobs | LinkedIn</title><div class="jobs-search-results-list"><h1>Sales Manager</h1><p>Build sales strategy and hire a team of sales representatives.</p></div>`);
  try { assert.match((await capture(dom)).error, /selected job details/); }
  finally { dom.window.close(); }
});

test("an incomplete detail header cannot borrow the title or company from the left job list", async () => {
  const dom = page(`<main>
    <section class="jobs-search-results-list"><h1>Sales Manager</h1><a href="/company/wrong/">Wrong Employer</a></section>
    <section class="scaffold-layout__detail"><div id="job-details">The selected job description loaded before its header and contains responsibilities and qualifications.</div></section>
  </main>`);
  try { assert.match((await capture(dom)).error, /selected job details/); }
  finally { dom.window.close(); }
});

test("other sites keep their selected-text capture behavior, including LinkedIn lookalike domains", async () => {
  for (const url of ["https://jobs.example.com/role", "https://linkedin.com.example.org/jobs/search/", "https://www.linkedin.com/feed/"]) {
    const dom = page(`<title>Current posting</title><p id="selected">User-selected description</p><aside>Unrelated private content</aside>`, url);
    try {
      const range = dom.window.document.createRange();
      range.selectNodeContents(dom.window.document.querySelector("#selected"));
      dom.window.getSelection().addRange(range);
      assert.deepEqual(await capture(dom), { sourceUrl: url, pageTitle: "Current posting", rawText: "User-selected description" });
    } finally { dom.window.close(); }
  }
});

test("the user's observed SDUI layout captures the selected Nooks posting without legacy selectors", async () => {
  const dom = page(sduiFixture, sduiUrl);
  try {
    assert.equal(dom.window.document.querySelectorAll("#job-details,.jobs-description__content,h1 a[href*='/jobs/view/']").length, 0);
    const context = await capture(dom);
    assert.equal(context.pageTitle, "Software Engineer, New Grad");
    assert.equal(context.sourceUrl, "https://www.linkedin.com/jobs/view/4446745306/");
    assert.match(context.rawText, /Company: Nooks\nLocation: San Francisco, CA\nHybrid\nFull-time/);
    assert.match(context.rawText, /base salary range for this role is \$200,000/);
    assert.doesNotMatch(context.rawText, /Sales Manager|Wrong Employer/);
  } finally { dom.window.close(); }
});

test("SDUI description includes list content outside the expandable intro and preserves line breaks", async () => {
  const dom = page(sduiFixture, sduiUrl);
  try {
    const intro = dom.window.document.querySelector('[data-testid="expandable-text-box"]');
    assert.doesNotMatch(intro.textContent, /Design, build, and ship full-stack features/);
    const context = await capture(dom);
    assert.match(context.rawText, /Design, build, and ship full-stack features using React, TypeScript, Node\.js, and Python\./);
    assert.match(context.rawText, /Bachelor's or Master's degree/);
    assert.match(context.rawText, /What You'll Do\n/);
    assert.doesNotMatch(context.rawText, /… more/);
  } finally { dom.window.close(); }
});

test("SDUI capture uses stable semantic attributes even when every generated CSS class changes", async () => {
  const dom = page(sduiFixture, sduiUrl);
  try {
    for (const element of dom.window.document.querySelectorAll('[class]')) element.className = 'new-generated-class';
    const context = await capture(dom);
    assert.equal(context.pageTitle, "Software Engineer, New Grad");
    assert.match(context.rawText, /Company: Nooks/);
    assert.doesNotMatch(context.rawText, /Wrong Employer/);
  } finally { dom.window.close(); }
});

test("SDUI display-contents wrappers can be captured even when they have no layout box", async () => {
  const dom = page(sduiFixture, sduiUrl);
  try {
    const description = dom.window.document.querySelector('[id^="JobDetails_AboutTheJob_"]');
    description.style.display = 'contents';
    for (const element of dom.window.document.querySelectorAll('[data-display-contents]')) element.style.display = 'contents';
    const original = dom.window.Element.prototype.getClientRects;
    dom.window.Element.prototype.getClientRects = function () {
      return dom.window.getComputedStyle(this).display === 'contents' ? [] : original.call(this);
    };
    assert.equal(description.getClientRects().length, 0);
    assert.equal((await capture(dom)).pageTitle, "Software Engineer, New Grad");
  } finally { dom.window.close(); }
});

test("SDUI title, description ID, and currentJobId must agree during a panel update", async () => {
  for (const mismatch of ['url', 'header', 'description']) {
    const dom = page(sduiFixture, mismatch === 'url' ? 'https://www.linkedin.com/jobs/search-results/?currentJobId=999' : sduiUrl);
    try {
      if (mismatch === 'header') for (const link of dom.window.document.querySelectorAll('a[href*="/jobs/view/"]')) link.href = '/jobs/view/999/';
      if (mismatch === 'description') dom.window.document.querySelector('[id^="JobDetails_AboutTheJob_"]').id = 'JobDetails_AboutTheJob_999';
      const context = await capture(dom);
      assert.match(context.error, /selected job details/);
      assert.equal(context.sourceUrl, undefined);
    } finally { dom.window.close(); }
  }
});

test("SDUI capture excludes company marketing and hidden old panels", async () => {
  const dom = page(sduiFixture, sduiUrl);
  try {
    const panel = dom.window.document.querySelector('[data-sdui-screen]');
    const stale = panel.cloneNode(true);
    stale.setAttribute('aria-hidden', 'true');
    stale.querySelector('[id^="JobDetails_AboutTheJob_"]').textContent = 'Hidden old description that should never be imported.';
    panel.before(stale);
    const companySection = dom.window.document.createElement('section');
    companySection.innerHTML = '<h2>About the company</h2><span data-testid="expandable-text-box">Unrelated company marketing sentinel</span>';
    panel.append(companySection);
    const context = await capture(dom);
    assert.equal(context.pageTitle, "Software Engineer, New Grad");
    assert.doesNotMatch(context.rawText, /Hidden old description|company marketing sentinel/);
  } finally { dom.window.close(); }
});
