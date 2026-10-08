// Synthetic, offline fixtures model publishing formats, not live website snapshots.
export const description = "Build reliable services with Python, React, and PostgreSQL. Collaborate with the engineering team to improve product performance.";
export const applicationJob = {
  title: "Staff Software Engineer",
  companyName: "Fixture Labs",
  location: "Toronto, Ontario, Canada",
  descriptionHtml: `<p>${description}</p>`,
  salary: { currency: "USD", min: 150000, max: 190000, unit: "YEAR" },
};
export const structuredJob = {
  "@type": "JobPosting",
  title: applicationJob.title,
  hiringOrganization: { name: applicationJob.companyName },
  jobLocation: { address: { addressLocality: "Toronto", addressRegion: "Ontario", addressCountry: "Canada" } },
  description: applicationJob.descriptionHtml,
  baseSalary: { currency: "USD", value: { minValue: 150000, maxValue: 190000, unitText: "YEAR" } },
};
export function jobPage({ ld, app, body = "", head = "", scriptAttributes = 'type="application/ld+json"' } = {}) {
  return `<html><head>${head}</head><body>${body}
    ${ld === undefined ? "" : `<script ${scriptAttributes}>${typeof ld === "string" ? ld : JSON.stringify(ld)}</script>`}
    ${app === undefined ? "" : `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { job: app } } })}</script>`}
  </body></html>`;
}
export const jobUrls = [
  ["Indeed", "https://www.indeed.com/viewjob", "jk", "abc123"],
  ["Greenhouse embed", "https://boards.greenhouse.io/embed/job_app", "token", "12345"],
  ["Greenhouse custom", "https://careers.example.com/openings", "gh_jid", "23456"],
  ["Lever", "https://jobs.lever.co/acme/abc-123", "lever-origin", "applied"],
  ["Ashby", "https://jobs.ashbyhq.com/acme/abc-123", "jobId", "34567"],
  ["Workday", "https://acme.myworkdayjobs.com/en-US/jobs", "jobId", "R12345"],
  ["SmartRecruiters", "https://jobs.smartrecruiters.com/acme/12345-engineer", "jobId", "45678"],
  ["iCIMS", "https://careers-acme.icims.com/jobs/123/job", "job", "56789"],
  ["Taleo", "https://acme.taleo.net/careersection/jobdetail.ftl", "job", "67890"],
  ["SuccessFactors", "https://career.successfactors.com/career", "career_job_req_id", "78901"],
  ["ADP", "https://workforcenow.adp.com/jobs", "cid", "tenant-123"],
  ["Paylocity", "https://recruiting.paylocity.com/Recruiting/Jobs/Details/123", "jobId", "89012"],
  ["BambooHR", "https://acme.bamboohr.com/careers", "id", "90123"],
  ["JazzHR", "https://acme.applytojob.com/apply", "job", "abc456"],
  ["Jobvite", "https://jobs.jobvite.com/acme/job/abc", "j", "abc789"],
  ["Custom multilingual", "https://example.com/emplois", "poste", "ingénieur & données"],
];
