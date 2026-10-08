import axios from "axios";
import dns from "node:dns/promises";
import net from "node:net";
import { getDomainFromUrl, normalizeUrl } from "../utils/url.js";
import { ROLE_KEYWORDS, SECTION_HEADERS, SKILL_PATTERNS } from "./parser.constants.js";

const JOB_SOURCES = [
  { name: "LinkedIn", patterns: ["linkedin.com"] },
  { name: "Indeed", patterns: ["indeed.com"] },
  { name: "Greenhouse", patterns: ["greenhouse.io", "boards.greenhouse.io"] },
  { name: "Lever", patterns: ["lever.co", "jobs.lever.co"] },
  { name: "Workday", patterns: ["myworkdayjobs.com", "myworkdaysite.com", "workdayjobs.com"] },
  { name: "Ashby", patterns: ["ashbyhq.com"] },
  { name: "SmartRecruiters", patterns: ["smartrecruiters.com"] },
  { name: "Wellfound", patterns: ["wellfound.com"] },
];

const SOURCE_NAMES = new Set(JOB_SOURCES.map((source) => source.name.toLowerCase()));
const COMPANY_SUFFIX_PATTERN = /\b(careers|jobs|hiring|inc\.?|llc|ltd\.?|corp\.?|corporation)\b/gi;
const MAX_FETCH_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 10000;
const TITLE_SEPARATOR_PATTERN = /\s+(?:[-|]|\u2013|\u2014|\u00b7)\s+/;
const TITLE_LABEL_PATTERN = /^(?:job\s+title|title|role|position)\s*[:\-]\s*(.+)$/i;
const TITLE_LABEL_ONLY_PATTERN = /^(?:job\s+title|title|role|position)$/i;
const COMPANY_LABEL_PATTERN = /^(?:company|organization|hiring\s+organization|employer)\s*[:\-]\s*(.+)$/i;
const COMPANY_LABEL_ONLY_PATTERN = /^(?:company|organization|hiring\s+organization|employer)$/i;
const LOCATION_LABEL_PATTERN = /^(?:locations?|job\s+location|work\s+location|based\s+in|office|offices|workplace\s+type|workplace|work\s+type)\s*[:\-]\s*(.+)$/i;
const LOCATION_LABEL_ONLY_PATTERN = /^(?:locations?|job\s+location|work\s+location|based\s+in|office|offices|workplace\s+type|workplace|work\s+type)$/i;
const LINKEDIN_HIRING_TITLE_PATTERN = /^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+(.+?))?(?:\s+\|\s+LinkedIn)?$/i;
const APPLICATION_TITLE_COMPANY_PATTERN = /^job application for\s+(.+?)\s+at\s+(.+?)$/i;
const IGNORED_LINE_PATTERN = /^(?:>|all jobs|apply now|apply|save|share this job|sign in|cookie policy|privacy policy|modify cookie preferences|accept all cookies|google chrome|microsoft edge|apple safari|mozilla firefox|sign in to save|save job|easy apply|back to jobs|skip to main content|expand search|clear text|join now|people|learning|show|forgot password\?|email or phone|password|or|report this job|use ai to assess how you fit|tailor my resume|am i a good fit for this job\?|see who .* hired|posted\b.*|reposted\b.*|promoted\b.*|actively hiring|be among the first|new)$/i;
const NON_COMPANY_LINE_PATTERN = /^(?:remote|hybrid|onsite|on-site|location\b.*|salary\b.*|compensation\b.*|pay range\b.*|base pay\b.*|department\b.*|team\b.*|employment type\b.*|full[- ]time|part[- ]time|contract|temporary|internship|mid[- ]senior|entry level|associate|director|executive|not applicable|posted\b.*|reposted\b.*|promoted\b.*|easy apply)$/i;
const GENERIC_TITLE_KEYS = ["jobTitle", "job_title", "title", "positionTitle", "position_title", "positionName", "position_name", "name", "roleName", "role_name", "postingTitle", "posting_title"];
const GENERIC_COMPANY_KEYS = ["company", "companyName", "company_name", "organization", "organizationName", "organization_name", "employer", "employerName", "employer_name", "hiringOrganization", "hiring_organization"];
const GENERIC_LOCATION_KEYS = ["location", "locations", "locationName", "location_name", "jobLocation", "job_location", "jobLocations", "job_locations", "office", "offices", "workplace"];
const GENERIC_DESCRIPTION_KEYS = ["description", "jobDescription", "job_description", "body", "content", "html", "descriptionHtml", "description_html"];
const GENERIC_SALARY_KEYS = ["salary", "baseSalary", "base_salary", "compensation", "payRange", "pay_range", "salaryRange", "salary_range", "basePay", "base_pay"];
const IGNORED_URL_TITLE_SEGMENTS = new Set([
  "apply",
  "boards",
  "careers",
  "detail",
  "details",
  "job",
  "job-detail",
  "job-details",
  "jobdetails",
  "jobs",
  "posting",
  "recruiting",
  "view",
  "view-job",
  "viewjob",
]);
const IGNORED_TITLE_VALUES = new Set(["detail", "details", "job detail", "job details", "jobdetails", "view job", "viewjob"]);
const US_STATE_NAME_PATTERN = "Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming";
const CITY_REGION_COUNTRY_SOURCE = `[A-Z][a-zA-Z .'-]+,\\s?(?:(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)|(?:${US_STATE_NAME_PATTERN}))(?:,\\s?(?:United States|USA|US))?`;
const CITY_REGION_COUNTRY_PATTERN = new RegExp(`\\b(${CITY_REGION_COUNTRY_SOURCE})\\b`);
const ROLE_LOCATION_LINE_PATTERN = new RegExp(`\\bin\\s+(${CITY_REGION_COUNTRY_SOURCE})\\b`);
const US_STATE_ABBREVIATIONS = new Set(["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "IA", "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY"]);

function normalizeOptional(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function titleCaseSlug(value) {
  return String(value ?? "")
    .replace(/(?:[_-](?:jr|req|requisition|job|jobid)\s*[-_]?\d+|\b(?:jr|req|requisition|job|jobid)\s*[-_]?\d+)$/i, "")
    .replace(/\?.*$/, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .flatMap((part) => part.replace(/([a-z])([A-Z])/g, "$1 $2").split(/\s+/))
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function isKnownSourceName(value) {
  return SOURCE_NAMES.has(String(value ?? "").trim().toLowerCase());
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasRoleKeyword(value) {
  const lower = String(value ?? "").toLowerCase();
  return ROLE_KEYWORDS.some((keyword) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword)}([^a-z0-9]|$)`, "i").test(lower));
}

function decodeCommonHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;|&#160;|&#x[aA]0;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&bull;|&#8226;|&#x2022;/gi, " \u2022 ")
    .replace(/&middot;|&#183;|&#x[bB]7;/g, " \u00b7 ")
    .replace(/&ndash;|&#8211;|&#x2013;/g, "\u2013")
    .replace(/&mdash;|&#8212;|&#x2014;/g, "\u2014")
    .replace(/&ldquo;|&#8220;|&#x201c;/gi, '"')
    .replace(/&rdquo;|&#8221;|&#x201d;/gi, '"')
    .replace(/&lsquo;|&#8216;|&#x2018;/gi, "'")
    .replace(/&rsquo;|&#8217;|&#x2019;/gi, "'")
    .replace(/&trade;|&#8482;|&#x2122;/gi, "")
    .replace(/&quot;|&#34;|&#x22;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'");
}

function cleanCandidate(value) {
  const cleaned = normalizeOptional(decodeCommonHtmlEntities(value))
    ?.replace(/\s+/g, " ")
    .replace(/^[|:,\-\u2013\u2014\u2022\u00b7]+|[|:,\-\u2013\u2014\u2022\u00b7]+$/g, "")
    .trim();
  return cleaned || null;
}

function cleanTitleCandidate(value) {
  if (value && typeof value === "object") return null;
  const candidate = cleanCandidate(value)
    ?.replace(/^(?:job application for|application for|apply(?:ing)? for|job opening:?)\s+/i, "")
    .replace(/\s+\|\s+(?:LinkedIn|Indeed|Glassdoor|ZipRecruiter).*$/i, "")
    .replace(/\s+-\s+(?:LinkedIn|Indeed|Glassdoor|ZipRecruiter).*$/i, "")
    .trim();
  const linkedInHiringMatch = candidate?.match(LINKEDIN_HIRING_TITLE_PATTERN);
  const applicationMatch = value && String(value).match(APPLICATION_TITLE_COMPANY_PATTERN);
  const cleaned =
    linkedInHiringMatch && hasRoleKeyword(linkedInHiringMatch[2])
      ? cleanCandidate(linkedInHiringMatch[2])
      : applicationMatch
        ? cleanCandidate(applicationMatch[1])
        : candidate;
  return cleaned || null;
}

function cleanCompanyName(value) {
  const cleaned = cleanCandidate(value)
    ?.replace(COMPANY_LABEL_PATTERN, "$1")
    .replace(/^(?:careers?|jobs)\s+at\s+/i, "")
    .replace(COMPANY_SUFFIX_PATTERN, "")
    .replace(/^at\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/\s*[.,]+$/g, "")
    .trim();
  if (!cleaned || isKnownSourceName(cleaned) || cleaned.length > 80) return null;
  return cleaned;
}

function isRejectedTitle(value) {
  const candidate = cleanTitleCandidate(value);
  if (!candidate) return true;
  const words = candidate.split(/\s+/).length;
  if (candidate.length > 120 || candidate.length < 3) return true;
  if (SECTION_HEADERS.has(candidate.toLowerCase())) return true;
  if (/^(?:careers?|jobs)(?:\s+at\b|\b)/i.test(candidate) && !hasRoleKeyword(candidate)) return true;
  if (isKnownSourceName(candidate)) return true;
  if (IGNORED_TITLE_VALUES.has(candidate.toLowerCase())) return true;
  if (/^(company|organization|employer|department|team|location|salary|compensation)\s*[:\-]/i.test(candidate)) return true;
  if (/^(apply|save|sign in|log in|share|view job|job details)$/i.test(candidate)) return true;
  if (words > 16) return true;
  if (words > 8 && /[.!?]$/.test(candidate)) return true;
  if (words > 7 && /^(we|you|this role|the role|join us|build|work with)\b/i.test(candidate)) return true;
  return false;
}

function getMeaningfulLines(rawText, limit = 16) {
  return String(rawText ?? "")
    .split("\n")
    .map(cleanCandidate)
    .filter(Boolean)
    .filter((line) => !IGNORED_LINE_PATTERN.test(line))
    .slice(0, limit);
}

function truncate(value, max = 1200) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function arrayify(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function splitTitleParts(value) {
  return cleanTitleCandidate(value)?.split(TITLE_SEPARATOR_PATTERN).map(cleanTitleCandidate).filter(Boolean) ?? [];
}

function splitCandidateTitleParts(value) {
  return cleanCandidate(value)?.split(TITLE_SEPARATOR_PATTERN).map(cleanCandidate).filter(Boolean) ?? [];
}

function singleRoleTitlePart(value) {
  const parts = splitCandidateTitleParts(value);
  if (parts.length < 2) return null;

  const roleParts = parts.filter(hasRoleKeyword);
  return roleParts.length === 1 ? roleParts[0] : null;
}

function normalizeDashSeparators(value) {
  return cleanCandidate(value)?.replace(/\s*[\u2013\u2014]\s*/g, " - ").replace(/\s+-\s+/g, " - ") ?? null;
}

function normalizeTrackingLocation(value) {
  const location = normalizeDashSeparators(value);
  if (!location) return null;
  return location.replace(/\bUS\b/i, "US");
}

function trackingJobDetailsFromUrl(sourceUrl) {
  if (!sourceUrl) return { title: null, location: null };
  try {
    const parsed = new URL(sourceUrl);
    const rawValue = ["utm_content", "job_content", "job_title", "jobTitle", "title"]
      .map((key) => parsed.searchParams.get(key))
      .find(Boolean);
    const text = normalizeDashSeparators(
      rawValue
        ?.replace(/\[[^\]]+\]/g, " ")
        .replace(/\([^)]*\d{3,}[^)]*\)/g, " "),
    );
    if (!text) return { title: null, location: null };

    const locationMatch = text.match(/\b((?:remote|hybrid|on-?site|virtual)\s*[-\u2013\u2014]\s*(?:us|usa|united states|canada))\b/i);
    const location = normalizeTrackingLocation(locationMatch?.[1]);
    const titleText = locationMatch ? text.slice(0, locationMatch.index) : text;
    const title = cleanTitleCandidate(normalizeDashSeparators(titleText));

    return {
      title: title && hasRoleKeyword(title) ? title : null,
      location,
    };
  } catch {
    return { title: null, location: null };
  }
}

function isOpaqueUrlSegment(value) {
  const segment = String(value ?? "").trim();
  return /^[a-f0-9]{24,}$/i.test(segment) || /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(segment);
}

function titleSlugFromValue(value) {
  return cleanTitleCandidate(value)?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ?? null;
}

function normalizeFetchUrl(url) {
  if (!url) return null;
  const parsed = new URL(String(url).trim());
  parsed.hash = "";
  return parsed.toString();
}

function isPrivateIp(address) {
  if (!address) return true;
  if (address === "::1" || address.startsWith("fe80:") || address.startsWith("fc") || address.startsWith("fd")) return true;

  if (net.isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }

  return false;
}

async function validateFetchUrl(sourceUrl) {
  const parsed = new URL(sourceUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https URLs can be fetched.");
  }

  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || isPrivateIp(host)) {
    throw new Error("Local and private network URLs cannot be fetched.");
  }

  const addresses = await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error("URL resolved to a private or unavailable address.");
  }
}

function decodeHtmlEntities(value) {
  const decodeCodePoint = (raw, radix) => {
    const codePoint = Number.parseInt(raw, radix);
    if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return null;
    return String.fromCodePoint(codePoint);
  };

  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => decodeCodePoint(code, 16) ?? match)
    .replace(/&#(\d+);/g, (match, code) => decodeCodePoint(code, 10) ?? match);
}

function stripHtmlToText(html) {
  return decodeHtmlEntities(
    String(html ?? "")
      .replace(/<script[\s\S]*?<\/script>/gi, "\n")
      .replace(/<style[\s\S]*?<\/style>/gi, "\n")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, "\n")
      .replace(/<\/(h[1-6]|p|div|section|article|li|ul|ol|br|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function extractHtmlTitle(html) {
  const match = String(html ?? "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanCandidate(decodeHtmlEntities(match?.[1] ?? ""));
}

function parseTagAttributes(tag) {
  const attrs = {};
  for (const match of String(tag ?? "").matchAll(/([:@\w-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) {
    attrs[match[1].toLowerCase()] = decodeHtmlEntities(match[3]);
  }
  return attrs;
}

function extractMetaContent(html, keys) {
  const wantedKeys = new Set(keys.map((key) => key.toLowerCase()));
  for (const match of String(html ?? "").matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseTagAttributes(match[0]);
    const key = attrs.property || attrs.name || attrs.itemprop;
    if (key && wantedKeys.has(key.toLowerCase()) && attrs.content) return cleanCandidate(attrs.content);
  }
  return null;
}

function extractHtmlMetadata(html) {
  return {
    title:
      extractMetaContent(html, ["og:title", "twitter:title", "title"]) ??
      extractHtmlTitle(html),
    description: extractMetaContent(html, ["og:description", "twitter:description", "description"]),
  };
}

function flattenJsonLd(value) {
  const items = [];
  const visit = (item) => {
    if (!item) return;
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (typeof item !== "object") return;
    items.push(item);
    if (item["@graph"]) visit(item["@graph"]);
    if (item.mainEntity) visit(item.mainEntity);
  };
  visit(value);
  return items;
}

function hasJsonLdType(item, type) {
  return arrayify(item?.["@type"]).some((candidate) => String(candidate).toLowerCase() === type.toLowerCase());
}

function looksLikeJobPosting(item) {
  if (!item || typeof item !== "object") return false;
  if (hasJsonLdType(item, "JobPosting")) return true;
  return Boolean(item.title && item.description && (item.hiringOrganization || item.jobLocation || item.baseSalary));
}

function resolveGraphReference(value, graphNodes) {
  if (!value || typeof value !== "object" || !value["@id"]) return value;
  return graphNodes.find((node) => node !== value && node?.["@id"] === value["@id"]) ?? value;
}

function extractStructuredName(value, graphNodes) {
  const resolved = resolveGraphReference(value, graphNodes);
  if (Array.isArray(resolved)) return extractStructuredName(resolved[0], graphNodes);
  if (typeof resolved === "string") return cleanCandidate(resolved);
  if (!resolved || typeof resolved !== "object") return null;
  return cleanCandidate(resolved.name ?? resolved.legalName ?? resolved.alternateName);
}

function extractStructuredAddress(address, graphNodes) {
  const resolved = resolveGraphReference(address, graphNodes);
  if (typeof resolved === "string") return cleanCandidate(resolved);
  if (!resolved || typeof resolved !== "object") return null;

  const country = extractStructuredName(resolved.addressCountry, graphNodes) ?? cleanCandidate(resolved.addressCountry);
  const parts = [
    resolved.addressLocality,
    resolved.addressRegion,
    country,
  ].map(cleanCandidate).filter(Boolean);
  return parts.length ? parts.join(", ") : cleanCandidate(resolved.name);
}

function extractStructuredLocation(jobPosting, graphNodes) {
  const locations = arrayify(jobPosting.jobLocation)
    .map((location) => resolveGraphReference(location, graphNodes))
    .map((location) => {
      if (typeof location === "string") return cleanCandidate(location);
      if (!location || typeof location !== "object") return null;
      return extractStructuredAddress(location.address, graphNodes) ?? extractStructuredName(location, graphNodes);
    })
    .filter(Boolean);

  const isRemote = arrayify(jobPosting.jobLocationType).some((type) => /telecommute|remote/i.test(String(type)));
  const applicantLocations = arrayify(jobPosting.applicantLocationRequirements)
    .map((location) => extractStructuredName(location, graphNodes) ?? extractStructuredAddress(location?.address, graphNodes))
    .filter(Boolean);

  if (isRemote && applicantLocations.length) return `Remote - ${applicantLocations.join(", ")}`;
  if (isRemote && !locations.length) return "Remote";
  if (isRemote && locations.length) return `${locations.join(" / ")} / Remote`;
  return locations.length ? locations.join(" / ") : null;
}

function parseStructuredMoneyValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "object") return parseStructuredMoneyValue(value.value ?? value.minValue ?? value.maxValue);
  const match = String(value).match(/(\d{2,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*([kKmM])?/);
  if (!match) return null;
  return parseMoneyAmount(match[1], match[2]);
}

function extractStructuredSalaryLine(jobPosting) {
  for (const salary of arrayify(jobPosting.baseSalary)) {
    if (!salary) continue;
    const salaryValue = typeof salary === "object" ? salary.value ?? salary : salary;
    const unitText = [salary?.unitText, salaryValue?.unitText].map(normalizeOptional).filter(Boolean).join(" ");
    if (unitText && isHourlyContext(unitText)) continue;

    const min = parseStructuredMoneyValue(salaryValue?.minValue ?? salary?.minValue);
    const max = parseStructuredMoneyValue(salaryValue?.maxValue ?? salary?.maxValue);
    const value = parseStructuredMoneyValue(salaryValue?.value ?? salaryValue);
    const currency = normalizeOptional(salary?.currency ?? salaryValue?.currency ?? "USD");

    if (min && max) return `Salary: ${currency} ${min} - ${max}`;
    if (value) return `Salary: ${currency} ${value}`;
  }
  return null;
}

function extractJsonScriptPayloads(html) {
  const payloads = [];
  for (const match of String(html ?? "").matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = parseTagAttributes(match[1]);
    const scriptType = String(attrs.type ?? "").toLowerCase();
    const scriptId = String(attrs.id ?? "").toLowerCase();
    const body = match[2].trim();
    if (!body || body.length > MAX_FETCH_BYTES) continue;
    if (scriptType === "application/ld+json") continue;
    const looksLikeJson =
      scriptType === "application/json" ||
      scriptId === "__next_data__" ||
      scriptId.includes("initial") ||
      /^[{[]/.test(body);
    if (!looksLikeJson) continue;

    try {
      let payload;
      try { payload = JSON.parse(body); }
      catch { payload = JSON.parse(decodeHtmlEntities(body)); }
      payloads.push(payload);
    } catch {
      continue;
    }
  }
  return payloads;
}

function getObjectValueByKeys(object, keys) {
  if (!object || typeof object !== "object") return null;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key) &&
      object[key] !== null && object[key] !== undefined &&
      !(typeof object[key] === "string" && !object[key].trim())) return object[key];
  }
  return null;
}

function genericStringValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number") return cleanCandidate(value);
  if (Array.isArray(value)) return value.map(genericStringValue).filter(Boolean).join(" / ") || null;
  if (typeof value !== "object") return null;
  return cleanCandidate(value.label ?? value.name ?? value.title ?? value.displayName ?? value.value ?? value.text);
}

function genericCompanyValue(value) {
  if (!value) return null;
  if (typeof value === "string") return cleanCompanyName(value);
  if (Array.isArray(value)) return genericCompanyValue(value[0]);
  if (typeof value !== "object") return null;
  return cleanCompanyName(value.name ?? value.companyName ?? value.legalName ?? value.displayName ?? value.title);
}

function genericLocationValue(value) {
  if (!value) return null;
  if (typeof value === "string") return cleanLocationCandidate(value);
  if (Array.isArray(value)) return value.map(genericLocationValue).filter(Boolean).join(" / ") || null;
  if (typeof value !== "object") return null;
  const address = value.address && typeof value.address === "object" ? value.address : value;
  const city = address.city ?? address.addressLocality ?? address.locality;
  const region = address.state ?? address.region ?? address.addressRegion;
  const country = genericStringValue(address.country ?? address.addressCountry);
  const parts = [city, region, country].map(cleanCandidate).filter(Boolean);
  return cleanLocationCandidate(parts.length ? parts.join(", ") : genericStringValue(value));
}

function genericLocationFromObjectFields(object) {
  if (!object || typeof object !== "object" || Array.isArray(object)) return null;
  const hasLocationFields = ["city", "state", "region", "country", "addressLocality", "addressRegion", "addressCountry"].some((key) =>
    Object.prototype.hasOwnProperty.call(object, key),
  );
  return hasLocationFields ? genericLocationValue(object) : null;
}

function genericDescriptionValue(value) {
  const text = typeof value === "string" ? stripHtmlToText(value) : genericStringValue(value);
  if (!text || text.length < 30) return null;
  return text;
}

function scoreGenericJobObject(object) {
  if (!object || typeof object !== "object" || Array.isArray(object)) return 0;
  const title = cleanTitleCandidate(getObjectValueByKeys(object, GENERIC_TITLE_KEYS));
  const company = genericCompanyValue(getObjectValueByKeys(object, GENERIC_COMPANY_KEYS));
  const location = genericLocationValue(getObjectValueByKeys(object, GENERIC_LOCATION_KEYS)) ?? genericLocationFromObjectFields(object);
  const description = genericDescriptionValue(getObjectValueByKeys(object, GENERIC_DESCRIPTION_KEYS));
  const hasJobishKey = Object.keys(object).some((key) => /job|posting|position|requisition|opening/i.test(key));

  let score = 0;
  if (title && !isRejectedTitle(title)) score += 4;
  if (description) score += 4;
  if (company) score += 2;
  if (location) score += 2;
  if (getObjectValueByKeys(object, GENERIC_SALARY_KEYS)) score += 1;
  if (hasJobishKey) score += 1;
  if (!title || isRejectedTitle(title)) score -= 4;
  if (!description && !company && !location) score -= 3;
  return score;
}

function collectJsonObjects(value, limit = 3000) {
  const objects = [];
  const seen = new Set();
  const visit = (item) => {
    if (objects.length >= limit || !item || typeof item !== "object" || seen.has(item)) return;
    seen.add(item);
    if (!Array.isArray(item)) objects.push(item);
    for (const child of Array.isArray(item) ? item : Object.values(item)) visit(child);
  };
  visit(value);
  return objects;
}

function extractGenericSalaryLine(object) {
  const salaryValue = getObjectValueByKeys(object, GENERIC_SALARY_KEYS);
  if (!salaryValue) return null;
  if (typeof salaryValue === "number") return `Salary: USD ${salaryValue}`;
  if (typeof salaryValue === "string") return /(\$|usd|cad|salary|compensation|pay|base)/i.test(salaryValue) ? `Salary: ${salaryValue}` : null;

  const salaryObject = typeof salaryValue === "object" ? salaryValue.value ?? salaryValue : null;
  if (!salaryObject || typeof salaryObject !== "object") return null;
  const unitText = [salaryValue.unitText, salaryObject.unitText, salaryValue.unit, salaryObject.unit].map(normalizeOptional).filter(Boolean).join(" ");
  if (unitText && isHourlyContext(unitText)) return null;

  const min = parseStructuredMoneyValue(
    salaryObject.minValue ?? salaryObject.min ?? salaryObject.minimum ?? salaryObject.minAmount ?? salaryObject.minimumSalary ?? salaryObject.salaryMin ?? salaryObject.salary_min ?? salaryObject.low,
  );
  const max = parseStructuredMoneyValue(
    salaryObject.maxValue ?? salaryObject.max ?? salaryObject.maximum ?? salaryObject.maxAmount ?? salaryObject.maximumSalary ?? salaryObject.salaryMax ?? salaryObject.salary_max ?? salaryObject.high,
  );
  const value = parseStructuredMoneyValue(salaryObject.value ?? salaryObject.amount);
  const currency = normalizeOptional(salaryValue.currency ?? salaryObject.currency ?? "USD");
  if (min && max) return `Salary: ${currency} ${min} - ${max}`;
  if (value) return `Salary: ${currency} ${value}`;
  return null;
}

function extractGenericJobPayloadFromJson(json) {
  const ranked = collectJsonObjects(json)
    .map((object) => ({ object, score: scoreGenericJobObject(object) }))
    .filter((candidate) => candidate.score >= 5)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0]?.object;
  if (!best) return null;

  const title = cleanTitleCandidate(getObjectValueByKeys(best, GENERIC_TITLE_KEYS));
  if (!title || isRejectedTitle(title)) return null;

  return {
    title,
    company: genericCompanyValue(getObjectValueByKeys(best, GENERIC_COMPANY_KEYS)),
    location: genericLocationValue(getObjectValueByKeys(best, GENERIC_LOCATION_KEYS)) ?? genericLocationFromObjectFields(best),
    employmentType: genericStringValue(getObjectValueByKeys(best, ["employmentType", "jobType", "workType"])),
    salary: extractGenericSalaryLine(best),
    description: genericDescriptionValue(getObjectValueByKeys(best, GENERIC_DESCRIPTION_KEYS)),
  };
}

function extractGenericJobPayload(html) {
  return extractJsonScriptPayloads(html)
    .map(extractGenericJobPayloadFromJson)
    .find(Boolean) ?? null;
}

function extractStructuredJobPayload(html) {
  const scriptMatches = String(html ?? "").matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);
  const graphNodes = [];
  for (const match of scriptMatches) {
    if (String(parseTagAttributes(match[1]).type ?? "").trim().toLowerCase() !== "application/ld+json") continue;
    try {
      // JSON strings may contain literal entity spellings; decode only as a fallback.
      let payload;
      try { payload = JSON.parse(match[2].trim()); }
      catch { payload = JSON.parse(decodeHtmlEntities(match[2]).trim()); }
      graphNodes.push(...flattenJsonLd(payload));
    } catch {
      continue;
    }
  }

  const jobPosting = graphNodes.find(looksLikeJobPosting);
  if (!jobPosting) return null;

  const hiringOrganization = resolveGraphReference(jobPosting.hiringOrganization, graphNodes);
  return {
    title: normalizeOptional(jobPosting.title),
    company: extractStructuredName(hiringOrganization, graphNodes),
    location: extractStructuredLocation(jobPosting, graphNodes),
    employmentType: arrayify(jobPosting.employmentType).map(cleanCandidate).filter(Boolean).join(", ") || null,
    salary: extractStructuredSalaryLine(jobPosting),
    description: stripHtmlToText(jobPosting.description ?? ""),
  };
}

export function extractJobPageDataFromHtml(html) {
  const jsonLd = extractStructuredJobPayload(html);
  const application = extractGenericJobPayload(html);
  const metadata = extractHtmlMetadata(html);
  const visibleText = stripHtmlToText(html);
  const fallbackText = [metadata.description, visibleText].filter(Boolean).join("\n");
  // Do not borrow fields from a different job embedded in a related-jobs widget.
  const compatibleApplication = !jsonLd?.title || !application?.title ||
    titleSlugFromValue(jsonLd.title) === titleSlugFromValue(application.title)
    ? application : null;
  const structuredTitle = cleanTitleCandidate(jsonLd?.title);
  const title = (structuredTitle && !isRejectedTitle(structuredTitle) ? structuredTitle : null) ?? compatibleApplication?.title ??
    extractTitle({ pageTitle: metadata.title, rawText: fallbackText });
  const company = jsonLd?.company ?? compatibleApplication?.company ??
    extractCompany({ pageTitle: metadata.title, rawText: fallbackText, parsedTitle: title });
  const fallbackSalary = extractSalaryRange(fallbackText);
  const fields = {
    title,
    company,
    location: jsonLd?.location ?? compatibleApplication?.location ??
      extractLocation(fallbackText, { parsedTitle: title, parsedCompany: company }),
    employmentType: jsonLd?.employmentType ?? compatibleApplication?.employmentType ?? null,
    salary: jsonLd?.salary ?? compatibleApplication?.salary ??
      (fallbackSalary.min && fallbackSalary.max ? `Salary: USD ${fallbackSalary.min} - ${fallbackSalary.max}` : null),
    description: normalizeOptional(jsonLd?.description) ?? compatibleApplication?.description ??
      normalizeOptional(visibleText) ?? metadata.description,
  };
  const structured = jsonLd || application ? fields : null;
  const pageTitle = structured?.title ?? metadata.title;
  const rawTextParts = [
    structured?.title,
    structured?.company,
    structured?.location,
    structured?.employmentType,
    structured?.salary,
    structured?.description,
  ].filter(Boolean);
  const rawText = rawTextParts.length ? rawTextParts.join("\n") : [pageTitle, metadata.description, stripHtmlToText(html)].filter(Boolean).join("\n");

  return {
    pageTitle,
    rawText,
    structured,
  };
}

export async function fetchJobPageData(sourceUrl) {
  let normalizedUrl = null;
  try {
    normalizedUrl = normalizeFetchUrl(sourceUrl);
  } catch (error) {
    return {
      attempted: Boolean(sourceUrl),
      success: false,
      sourceUrl: String(sourceUrl ?? ""),
      status: null,
      contentType: null,
      bytes: 0,
      error: error.message,
      pageTitle: null,
      rawTextLength: 0,
    };
  }
  const result = {
    attempted: Boolean(normalizedUrl),
    success: false,
    sourceUrl: normalizedUrl,
    status: null,
    contentType: null,
    bytes: 0,
    error: null,
    pageTitle: null,
    rawTextLength: 0,
  };

  if (!normalizedUrl) return result;

  try {
    await validateFetchUrl(normalizedUrl);
    const response = await axios.get(normalizedUrl, {
      timeout: FETCH_TIMEOUT_MS,
      maxRedirects: 3,
      maxContentLength: MAX_FETCH_BYTES,
      responseType: "text",
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": "JobAppLedger/1.0 (+https://localhost)",
      },
      validateStatus: (status) => status >= 200 && status < 400,
    });

    const body = String(response.data ?? "");
    const contentType = String(response.headers?.["content-type"] ?? "");
    if (contentType && !contentType.toLowerCase().includes("html") && !contentType.toLowerCase().includes("text")) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    const extracted = extractJobPageDataFromHtml(body);
    result.success = true;
    result.status = response.status;
    result.contentType = contentType || null;
    result.bytes = Buffer.byteLength(body);
    result.pageTitle = extracted.pageTitle;
    result.rawTextLength = extracted.rawText?.length ?? 0;
    result.rawText = extracted.rawText;
    result.structured = extracted.structured;
    return result;
  } catch (error) {
    result.error = error.message;
    return result;
  }
}

export function detectJobSource({ sourceUrl, sourceDomain } = {}) {
  const domain = normalizeOptional(sourceDomain)?.replace(/^www\./i, "").toLowerCase() ?? getDomainFromUrl(sourceUrl);
  if (!domain) return { sourceDomain: null, source: null };

  const matched = JOB_SOURCES.find((source) =>
    source.patterns.some((pattern) => domain === pattern || domain.endsWith(`.${pattern}`)),
  );

  return {
    sourceDomain: domain,
    source: matched?.name ?? null,
  };
}

export function cleanJobText(rawText) {
  const text = normalizeOptional(rawText);
  if (!text) return null;

  return decodeCommonHtmlEntities(text)
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !IGNORED_LINE_PATTERN.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function titleCandidatesFromPageTitle(pageTitle) {
  const title = cleanTitleCandidate(pageTitle);
  if (!title) return [];

  const candidates = [];
  const parts = splitCandidateTitleParts(title);
  if (parts.length < 2) {
    candidates.push({ value: title, source: "pageTitle", weight: 20 });
  }

  if (parts.length >= 2) {
    const roleParts = parts.filter(hasRoleKeyword);
    if (roleParts.length !== 1) {
      candidates.push({ value: title, source: "pageTitle", weight: 20 });
    }
    parts.forEach((part, index) => {
      candidates.push({ value: part, source: "pageTitlePart", weight: index === 0 ? 18 : 14 });
    });
  }

  const atMatch = title.match(/^(.+?)\s+at\s+(.+?)$/i);
  if (atMatch) candidates.push({ value: atMatch[1], source: "pageTitleAt", weight: 22 });

  return candidates;
}

function titleCandidateFromUrl(sourceUrl) {
  if (!sourceUrl) return null;
  try {
    const parsed = new URL(sourceUrl);
    const domain = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (domain.endsWith("greenhouse.io") && parts.some((part) => part.toLowerCase() === "jobs")) {
      const jobIndex = parts.findIndex((part) => part.toLowerCase() === "jobs");
      const afterJobs = parts.slice(jobIndex + 1).filter((part) => !/^\d+$/.test(part));
      if (!afterJobs.length) return null;
      return cleanTitleCandidate(titleCaseSlug(decodeURIComponent(afterJobs.at(-1))));
    }

    const slug = [...parts]
      .reverse()
      .find((part) => !IGNORED_URL_TITLE_SEGMENTS.has(part.toLowerCase()) && !/^\d+$/.test(part) && !isOpaqueUrlSegment(part) && part.length > 3);
    return slug ? cleanTitleCandidate(titleCaseSlug(decodeURIComponent(slug))) : null;
  } catch {
    return null;
  }
}

function buildTitleCandidates({ pageTitle, rawText, sourceUrl } = {}) {
  const trackingDetails = trackingJobDetailsFromUrl(sourceUrl);
  const candidates = trackingDetails.title
    ? [{ value: trackingDetails.title, source: "trackingParam", weight: 26 }, ...titleCandidatesFromPageTitle(pageTitle)]
    : [...titleCandidatesFromPageTitle(pageTitle)];
  const lines = getMeaningfulLines(rawText, 10);

  lines.slice(0, 8).forEach((line, index) => {
    const labelMatch = line.match(TITLE_LABEL_PATTERN);
    const lineTitle = labelMatch ? labelMatch[1] : singleRoleTitlePart(line) ?? line;
    candidates.push({
      value: lineTitle,
      source: labelMatch ? "titleLabel" : lineTitle === line ? "topLine" : "topLinePart",
      weight: (labelMatch ? 24 : 22) - index,
    });
    if (TITLE_LABEL_ONLY_PATTERN.test(line) && lines[index + 1]) {
      candidates.push({ value: lines[index + 1], source: "titleLabelNextLine", weight: 25 - index });
    }
  });

  const urlCandidate = titleCandidateFromUrl(sourceUrl);
  if (urlCandidate) candidates.push({ value: urlCandidate, source: "url", weight: 8 });

  return candidates;
}

function scoreTitleCandidate(candidate, index) {
  const value = cleanTitleCandidate(candidate.value);
  if (isRejectedTitle(value)) return -1;

  let score = candidate.weight ?? 0;
  const words = value.split(/\s+/).length;
  if (hasRoleKeyword(value)) score += 35;
  if (/^(senior|staff|principal|lead|junior|sr\.?|jr\.?)\b/i.test(value)) score += 8;
  if (candidate.source === "titleLabel" || candidate.source === "titleLabelNextLine") score += 10;
  if (index < 4) score += 5;
  if (value.length <= 80) score += 5;
  if (words > 10) score -= 8;
  if (/[.!?]$/.test(value)) score -= 12;
  return score;
}

function rankTitleCandidates(candidates) {
  return candidates
    .map((candidate, index) => {
      const score = scoreTitleCandidate(candidate, index);
      return {
        ...candidate,
        value: cleanTitleCandidate(candidate.value),
        score,
        rejected: score < 0,
      };
    })
    .filter((candidate) => candidate.value && candidate.score >= 0)
    .sort((a, b) => b.score - a.score);
}

export function extractTitle({ pageTitle, rawText, sourceUrl } = {}) {
  const ranked = rankTitleCandidates(buildTitleCandidates({ pageTitle, rawText, sourceUrl }));

  return ranked[0]?.value ?? null;
}

function companyFromPageTitle(pageTitle, parsedTitle) {
  const title = cleanCandidate(pageTitle);
  if (!title) return null;
  if (parsedTitle && title.toLowerCase() === cleanTitleCandidate(parsedTitle)?.toLowerCase()) return null;

  const linkedInHiringMatch = title.match(LINKEDIN_HIRING_TITLE_PATTERN);
  if (linkedInHiringMatch && cleanTitleCandidate(linkedInHiringMatch[2])?.toLowerCase() === parsedTitle?.toLowerCase()) {
    return cleanCompanyName(linkedInHiringMatch[1]);
  }

  const atMatch = title.match(/^(.+?)\s+at\s+(.+?)$/i);
  if (atMatch && hasRoleKeyword(atMatch[1])) return cleanCompanyName(atMatch[2]);

  const parts = splitTitleParts(title);
  if (parts.length < 2) return null;

  const titleIndex = parts.findIndex((part) => hasRoleKeyword(part) || part?.toLowerCase() === parsedTitle?.toLowerCase());
  if (titleIndex === 0) return cleanCompanyName(parts[1]);
  if (titleIndex > 0) return cleanCompanyName(parts[0]);
  if (parsedTitle && !hasRoleKeyword(parts[0]) && parts[0].length <= 60) return cleanCompanyName(parts[0]);
  return null;
}

function companyFromUrl(sourceUrl, source) {
  if (!sourceUrl) return null;
  try {
    const parsed = new URL(sourceUrl);
    const parts = parsed.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
    const domain = parsed.hostname.replace(/^www\./i, "").toLowerCase();

    if (source === "Greenhouse" && parts[0]) return cleanCompanyName(titleCaseSlug(parts[0]));
    if (source === "Lever" && parts[0]) return cleanCompanyName(titleCaseSlug(parts[0]));
    if (source === "Ashby" && parts[0]) return cleanCompanyName(titleCaseSlug(parts[0]));
    if (source === "SmartRecruiters" && parts[0]) return cleanCompanyName(titleCaseSlug(parts[0]));
    if (source === "Workday") {
      const hostPart = domain.split(".")[0];
      const company = hostPart.replace(/^wd\d+$/i, "");
      if (company) return cleanCompanyName(titleCaseSlug(company));
      const recruitingIndex = parts.findIndex((part) => part.toLowerCase() === "recruiting");
      if (recruitingIndex >= 0 && parts[recruitingIndex + 1]) {
        return cleanCompanyName(titleCaseSlug(parts[recruitingIndex + 1]));
      }
    }

    if (!source) {
      const domainParts = domain.split(".");
      const secondLevel = domainParts.length >= 2 ? domainParts.at(-2) : domainParts[0];
      return cleanCompanyName(titleCaseSlug(secondLevel));
    }
  } catch {
    return null;
  }
  return null;
}

function isCompanyLineCandidate(line, { allowRoleKeyword = false } = {}) {
  return Boolean(line && !NON_COMPANY_LINE_PATTERN.test(line) && !cityStateFromText(line) && (allowRoleKeyword || !hasRoleKeyword(line)));
}

function lineMatchesParsedTitle(line, parsedTitle) {
  const expected = cleanTitleCandidate(parsedTitle)?.toLowerCase();
  if (!expected) return false;
  const lineTitle = cleanTitleCandidate(line)?.toLowerCase();
  return lineTitle === expected || singleRoleTitlePart(line)?.toLowerCase() === expected;
}

function companyFromLineWithTitle(line, parsedTitle) {
  const text = cleanCandidate(line);
  const title = cleanTitleCandidate(parsedTitle);
  if (!text || !title) return null;

  const pipeParts = text.split(/\s+\|\s+/).map(cleanCandidate).filter(Boolean);
  if (pipeParts.length > 1) {
    const companyPart = pipeParts.find(
      (part) => !lineMatchesParsedTitle(part, title) && !/job details/i.test(part) && !hasRoleKeyword(part),
    );
    const company = cleanCompanyName(companyPart);
    if (company) return company;
  }

  const lowerText = text.toLowerCase();
  const titleIndex = lowerText.indexOf(title.toLowerCase());
  if (titleIndex > 0) return cleanCompanyName(text.slice(0, titleIndex));

  return null;
}

function companyAdjacentToTitle(rawText, parsedTitle) {
  const lines = getMeaningfulLines(rawText, 20);
  for (let titleIndex = 0; titleIndex < lines.length; titleIndex += 1) {
    if (!lineMatchesParsedTitle(lines[titleIndex], parsedTitle)) continue;

    const company = lines
      .slice(titleIndex + 1, titleIndex + 5)
      .filter((line) => !lineMatchesParsedTitle(line, parsedTitle))
      .map((line) => companyFromLineWithTitle(line, parsedTitle) ?? cleanCompanyName(line))
      .find((line) => isCompanyLineCandidate(line, { allowRoleKeyword: true }));

    if (company) return company;
  }

  return null;
}

function companyFromApplicationLine(rawText, parsedTitle) {
  const lines = getMeaningfulLines(rawText, 30);
  for (const line of lines) {
    const match = line.match(APPLICATION_TITLE_COMPANY_PATTERN);
    if (!match) continue;
    if (cleanTitleCandidate(match[1])?.toLowerCase() === parsedTitle?.toLowerCase()) {
      return cleanCompanyName(match[2]);
    }
  }
  return null;
}

function companyFromRawText(rawText, parsedTitle, markersOnly = false) {
  const lines = getMeaningfulLines(rawText, 20);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const labelMatch = line.match(COMPANY_LABEL_PATTERN);
    if (labelMatch) return cleanCompanyName(labelMatch[1]);
    if (COMPANY_LABEL_ONLY_PATTERN.test(line) && lines[index + 1]) {
      return cleanCompanyName(lines[index + 1]);
    }
  }

  if (markersOnly) return null;

  const titleIndex = lines.findIndex((line) => line.toLowerCase() === parsedTitle?.toLowerCase());
  const topLineCandidates = titleIndex >= 0 ? lines.slice(titleIndex + 1, titleIndex + 4) : lines.slice(0, 4);
  return topLineCandidates
    .map(cleanCompanyName)
    .find((line, index) => {
      const immediatelyAfterTitle = titleIndex >= 0 && index === 0;
      return isCompanyLineCandidate(line, { allowRoleKeyword: immediatelyAfterTitle });
    }) ?? null;
}

export function extractCompany({ pageTitle, rawText, sourceUrl, source, parsedTitle } = {}) {
  const labeledCompany = companyFromRawText(rawText, parsedTitle, true);
  if (labeledCompany) return labeledCompany;

  const applicationLineCompany = companyFromApplicationLine(rawText, parsedTitle);
  if (applicationLineCompany) return applicationLineCompany;

  const adjacentCompany = companyAdjacentToTitle(rawText, parsedTitle);
  if (adjacentCompany) return adjacentCompany;

  const pageTitleCompany = companyFromPageTitle(pageTitle, parsedTitle);
  if (pageTitleCompany) return pageTitleCompany;

  const urlCompany = companyFromUrl(sourceUrl, source);
  if (urlCompany) return urlCompany;

  return companyFromRawText(rawText, parsedTitle) ?? null;
}

function cleanLocationCandidate(value) {
  const location = cleanCandidate(value);
  if (!location || location.length > 120) return null;
  if (/^(salary|compensation|pay range|job title|role|company)\b/i.test(location)) return null;
  if (location.split(/\s+/).length > 12 && /[.!?]$/.test(location)) return null;
  return location;
}

function cityStateFromText(text) {
  const cityStateMatch = String(text ?? "").match(CITY_REGION_COUNTRY_PATTERN);
  return cleanLocationCandidate(cityStateMatch?.[1]);
}

function locationFromRoleLocationLine(line) {
  const locationMatch = String(line ?? "").match(ROLE_LOCATION_LINE_PATTERN);
  return cleanLocationCandidate(locationMatch?.[1]);
}

function isCountryOnlyLocation(value) {
  return /^(?:United States|USA|US|Canada|Remote)$/i.test(String(value ?? "").trim());
}

function isStandaloneLocationLine(line) {
  const location = cleanLocationCandidate(line);
  if (!location || location.length > 100) return false;
  if (/[.!?]$/.test(location) || /\d/.test(location)) return false;
  if (isCountryOnlyLocation(location)) return true;
  return cityStateFromText(location) === location || /^[A-Z][a-zA-Z .'-]+,\s?[A-Z][a-zA-Z .'-]+(?:,\s?(?:United States|USA|US|Canada))$/i.test(location);
}

function locationAdjacentToTitleCompany(lines, parsedTitle, parsedCompany) {
  if (!parsedTitle || !parsedCompany) return null;
  for (let index = 0; index < lines.length - 2; index += 1) {
    const titleMatches = cleanTitleCandidate(lines[index])?.toLowerCase() === parsedTitle.toLowerCase();
    const companyMatches = cleanCompanyName(lines[index + 1])?.toLowerCase() === parsedCompany.toLowerCase();
    if (!titleMatches || !companyMatches) continue;
    const location = cleanLocationCandidate(lines[index + 2]);
    if (location && isStandaloneLocationLine(location)) return location;
  }
  return null;
}

function formatUrlLocationSlug(value) {
  const parts = String(value ?? "").split(/[-_]+/).filter(Boolean);
  if (!parts.length) return null;

  const normalizedParts = parts.map((part) => {
    const upper = part.toUpperCase();
    if (upper === "US") return "USA";
    if (upper === "USA") return "USA";
    if (US_STATE_ABBREVIATIONS.has(upper)) return upper;
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  });

  if (/^(remote|virtual)$/i.test(parts[0]) && normalizedParts.length > 1) {
    return `${normalizedParts[0]} - ${normalizedParts.slice(1).join(" ")}`;
  }
  if (normalizedParts.length === 2 && US_STATE_ABBREVIATIONS.has(normalizedParts[1])) {
    return `${normalizedParts[0]}, ${normalizedParts[1]}`;
  }
  return normalizedParts.join(" ");
}

function looksLikeLocationSlug(value) {
  const parts = String(value ?? "").split(/[-_]+/).filter(Boolean);
  if (!parts.length || isOpaqueUrlSegment(value)) return false;
  const lowerParts = parts.map((part) => part.toLowerCase());
  const lastUpper = parts.at(-1)?.toUpperCase();
  return (
    lowerParts.some((part) => ["remote", "virtual", "usa", "us", "united", "states", "canada"].includes(part)) ||
    US_STATE_ABBREVIATIONS.has(lastUpper)
  );
}

function locationFromUrl(sourceUrl, parsedTitle) {
  if (!sourceUrl || !parsedTitle) return null;
  try {
    const parsed = new URL(sourceUrl);
    const parts = parsed.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
    const titleSlug = titleSlugFromValue(parsedTitle);
    const titleIndex = parts.findIndex((part) => titleSlugFromValue(titleCaseSlug(part)) === titleSlug);
    if (titleIndex <= 0) return null;

    const locationSlug = [...parts.slice(0, titleIndex)].reverse().find(looksLikeLocationSlug);
    return cleanLocationCandidate(formatUrlLocationSlug(locationSlug));
  } catch {
    return null;
  }
}

export function extractLocation(rawText, { parsedTitle, parsedCompany, sourceUrl } = {}) {
  const text = normalizeOptional(rawText);
  const trackingLocation = trackingJobDetailsFromUrl(sourceUrl).location;
  if (!text) return trackingLocation;

  const lines = getMeaningfulLines(text, 24);
  const adjacentLocation = locationAdjacentToTitleCompany(lines, parsedTitle, parsedCompany);
  if (adjacentLocation) return adjacentLocation;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const labelMatch = line.match(LOCATION_LABEL_PATTERN);
    if (labelMatch) {
      const location = cleanLocationCandidate(labelMatch[1]);
      if (location) return location;
    }
    if (LOCATION_LABEL_ONLY_PATTERN.test(line) && lines[index + 1]) {
      const location = cleanLocationCandidate(lines[index + 1]);
      if (location) return location;
    }
  }

  const roleLocation = lines.map(locationFromRoleLocationLine).find(Boolean);
  if (roleLocation) return roleLocation;

  const locationLine = lines.find(isStandaloneLocationLine);
  if (locationLine) return cleanLocationCandidate(locationLine);

  const remoteLine = lines.find((line) =>
    /\b(remote|hybrid|onsite|on-site)\b/i.test(line) &&
    line.length <= 100 &&
    !/[.!?]$/.test(line) &&
    !/^(this|we|you|the role)\b/i.test(line)
  );
  if (remoteLine) return remoteLine;

  if (trackingLocation) return trackingLocation;

  return cityStateFromText(text) ?? locationFromUrl(sourceUrl, parsedTitle);
}

function isHourlyContext(text) {
  return /\b(hourly|per hour|\/\s?hr|\/\s?hour|an hour|hour|hr)\b/i.test(text);
}

function parseMoneyAmount(rawValue, suffix) {
  const numeric = Number(String(rawValue).replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return null;

  const normalizedSuffix = suffix?.trim().toLowerCase();
  const value =
    normalizedSuffix === "k"
      ? numeric * 1000
      : normalizedSuffix === "m"
        ? numeric * 1000000
        : numeric;
  if (value < 20000 || value > 1000000) return null;
  return Math.round(value);
}

function collectSalaryAmountsFromLine(line) {
  const amounts = [];
  const matches = String(line ?? "").matchAll(/(?:USD|CAD|US\$|CA\$)?\s*\$?\s*(\d{2,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*([kKmM])?\b/g);
  for (const match of matches) {
    const value = parseMoneyAmount(match[1], match[2]);
    if (value) amounts.push(value);
  }
  return amounts;
}

export function extractSalaryRange(rawText) {
  const text = normalizeOptional(rawText);
  if (!text) return { min: null, max: null };

  const salaryLines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /(\$|usd|cad|salary|compensation|pay range|base pay|annual base|on-target earnings|ote)/i.test(line))
    .filter((line) => !isHourlyContext(line));

  const amounts = [];
  for (const line of salaryLines) {
    amounts.push(...collectSalaryAmountsFromLine(line));
    if (amounts.length >= 2) break;
  }

  const unique = [...new Set(amounts)];
  if (unique.length >= 2) {
    const [min, max] = unique.slice(0, 2).sort((a, b) => a - b);
    return { min, max };
  }

  return { min: unique[0] ?? null, max: null };
}

function salaryDebug(rawText) {
  const text = normalizeOptional(rawText);
  if (!text) return [];

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /(\$|usd|cad|salary|compensation|pay range|base pay|annual base|on-target earnings|ote)/i.test(line))
    .slice(0, 12)
    .map((line) => {
      const ignoredHourly = isHourlyContext(line);
      const amounts = collectSalaryAmountsFromLine(line);
      return { line, ignoredHourly, amounts };
    });
}

export function extractSkills(rawText) {
  const text = normalizeOptional(rawText);
  if (!text) return [];

  const matches = [];
  SKILL_PATTERNS.forEach((skill, skillIndex) => {
    const escapedSkill = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^a-z0-9+#])${escapedSkill}([^a-z0-9+#]|$)`, "gi");
    for (const match of text.matchAll(pattern)) {
      const start = match.index + match[1].length;
      matches.push({ skill, skillIndex, start, end: start + skill.length });
    }
  });

  return SKILL_PATTERNS.filter((skill, skillIndex) =>
    matches.some((match) => {
      if (match.skillIndex !== skillIndex) return false;
      return !matches.some(
        (other) =>
          other.skillIndex !== skillIndex &&
          other.start <= match.start &&
          other.end >= match.end &&
          other.skill.length > match.skill.length,
      );
    }),
  );
}

function summarizeFetchResult(fetchResult) {
  if (!fetchResult) return null;
  const { rawText, ...summary } = fetchResult;
  return {
    ...summary,
    rawTextPreview: rawText ? truncate(rawText, 600) : null,
  };
}

function buildParserDebug({ input, sourceUrl, extractionUrl, sourceDomain, pageTitle, rawText, cleanedText, sourceInfo, parsed, fetchResult }) {
  const meaningfulLines = getMeaningfulLines(cleanedText, 40);
  const titleCandidates = rankTitleCandidates(buildTitleCandidates({ pageTitle, rawText: cleanedText, sourceUrl: extractionUrl ?? sourceUrl })).slice(0, 15);
  const titleIndex = meaningfulLines.findIndex((line) => line.toLowerCase() === parsed.parsedTitle?.toLowerCase());
  const companyTopLineCandidates = titleIndex >= 0 ? meaningfulLines.slice(titleIndex + 1, titleIndex + 4) : meaningfulLines.slice(0, 4);

  return {
    urlFetching: summarizeFetchResult(fetchResult) ?? {
      attempted: false,
      reason: "No URL fetch was requested. rawText and pageTitle came from the request payload.",
    },
    normalizedInput: {
      sourceUrl,
      fetchUrl: input.fetchUrl ?? sourceUrl,
      sourceDomain,
      pageTitle,
      rawTextLength: rawText?.length ?? 0,
      cleanedTextLength: cleanedText?.length ?? 0,
      debugRequested: Boolean(input.debug),
    },
    textPreview: {
      rawText: truncate(rawText),
      cleanedText: truncate(cleanedText),
      firstMeaningfulLines: meaningfulLines,
    },
    candidates: {
      title: titleCandidates,
      company: {
        fromPageTitle: companyFromPageTitle(pageTitle, parsed.parsedTitle),
        fromUrl: companyFromUrl(sourceUrl, sourceInfo.source),
        topLinesChecked: companyTopLineCandidates,
      },
      location: {
        markerMatch: cleanedText?.match(/(?:^|\n)\s*(?:location|work location|based in|office)\s*[:\-]?\s*([^\n]+)/i)?.[1] ?? null,
        remoteOrHybridLines: meaningfulLines.filter((line) => /\b(remote|hybrid|onsite|on-site)\b/i.test(line)).slice(0, 8),
      },
      salary: salaryDebug(cleanedText),
      skills: extractSkills(cleanedText),
    },
    decision: {
      source: sourceInfo.source,
      parsedTitle: parsed.parsedTitle,
      parsedCompany: parsed.parsedCompany,
      parsedLocation: parsed.parsedLocation,
      parsedSalaryMin: parsed.parsedSalaryMin,
      parsedSalaryMax: parsed.parsedSalaryMax,
      confidence: parsed.confidence,
    },
  };
}

export function scoreParserResult(parsed) {
  let score = 0;
  if (parsed.parsedTitle) score += 0.25;
  if (parsed.parsedCompany) score += 0.2;
  if (parsed.parsedLocation) score += 0.15;
  if (parsed.parsedSalaryMin || parsed.parsedSalaryMax) score += 0.1;
  if (parsed.parsedDescription && parsed.parsedDescription.length >= 100) score += 0.2;
  if (parsed.source) score += 0.1;
  return Math.min(1, Number(score.toFixed(2)));
}

export function parseJobDescription(input = {}) {
  const extractionUrl = normalizeOptional(input.fetchUrl) ?? normalizeOptional(input.sourceUrl);
  const sourceUrl = normalizeUrl(normalizeOptional(input.sourceUrl));
  const sourceDomain = normalizeOptional(input.sourceDomain) ?? getDomainFromUrl(sourceUrl);
  const pageTitle = normalizeOptional(input.pageTitle);
  const rawText = normalizeOptional(input.rawText);
  const cleanedText = cleanJobText(rawText);
  const sourceInfo = detectJobSource({ sourceUrl, sourceDomain });

  const structured = input.fetchResult?.success ? input.fetchResult.structured : null;
  const parsedTitle = cleanTitleCandidate(structured?.title) ?? extractTitle({ pageTitle, rawText: cleanedText, sourceUrl: extractionUrl ?? sourceUrl });
  const parsedCompany = normalizeOptional(structured?.company) ?? extractCompany({
    pageTitle,
    rawText: cleanedText,
    sourceUrl,
    source: sourceInfo.source,
    parsedTitle,
  });
  const parsedLocation = normalizeOptional(structured?.location) ?? extractLocation(cleanedText, { parsedTitle, parsedCompany, sourceUrl: extractionUrl ?? sourceUrl });
  const salary = extractSalaryRange(structured?.salary ?? cleanedText);

  const parsed = {
    sourceUrl,
    sourceDomain: sourceInfo.sourceDomain ?? sourceDomain,
    source: sourceInfo.source,
    parsedTitle,
    parsedCompany,
    parsedLocation,
    parsedSalaryMin: salary.min,
    parsedSalaryMax: salary.max,
    parsedDescription: cleanedText,
  };

  const result = {
    ...parsed,
    confidence: scoreParserResult(parsed),
    skills: extractSkills(cleanedText),
  };

  if (input.debug) {
    result.debug = buildParserDebug({
      input,
      sourceUrl,
      sourceDomain: parsed.sourceDomain,
      pageTitle,
      rawText,
      cleanedText,
      sourceInfo,
      parsed: result,
      fetchResult: input.fetchResult,
      extractionUrl,
    });
    console.info("[parser:job-description]", JSON.stringify(result.debug, null, 2));
  }

  return result;
}

export async function parseJobDescriptionWithFetch(input = {}) {
  const sourceUrl = normalizeUrl(normalizeOptional(input.sourceUrl));
  const fetchUrl = normalizeOptional(input.fetchUrl) ?? normalizeOptional(input.sourceUrl);
  const shouldFetch = Boolean(fetchUrl && !normalizeOptional(input.rawText));
  let fetchResult = {
    attempted: false,
    reason: normalizeOptional(input.rawText)
      ? "Skipped because rawText was supplied in the request."
      : "Skipped because sourceUrl was not supplied.",
  };
  let enrichedInput = { ...input };

  if (shouldFetch) {
    fetchResult = await fetchJobPageData(fetchUrl);
    if (fetchResult.success && fetchResult.rawText) {
      enrichedInput = {
        ...enrichedInput,
        pageTitle: normalizeOptional(enrichedInput.pageTitle) ?? fetchResult.pageTitle,
        rawText: fetchResult.rawText,
      };
    }
  }

  const parsed = parseJobDescription({ ...enrichedInput, fetchResult });
  return {
    ...parsed,
    pageTitle: normalizeOptional(enrichedInput.pageTitle),
    rawText: normalizeOptional(enrichedInput.rawText),
    fetchResult,
  };
}
