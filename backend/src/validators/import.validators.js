import { getDomainFromUrl, normalizeUrl } from "../utils/url.js";

const APP_STATUSES = new Set(["SAVED", "APPLIED", "INTERVIEWING", "OFFER", "REJECTED", "WITHDRAWN"]);
const CAPTURE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeOptional(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function validateLength(value, max, field) {
  if (value && value.length > max) throw new Error(`${field} must be ${max} characters or less.`);
}

function validateUrl(value, field) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    return parsed.toString();
  } catch {
    throw new Error(`${field} must be a valid http or https URL.`);
  }
}

function parseOptionalInt(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${field} must be an integer.`);
  if (parsed < 0 || parsed > 1000000) throw new Error(`${field} is outside the allowed range.`);
  return parsed;
}

function parseDate(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date.`);
  return date;
}

function normalizeParserPayload(body = {}) {
  const sourceUrl = normalizeOptional(body.sourceUrl);
  const validatedUrl = validateUrl(sourceUrl, "sourceUrl");
  const normalizedUrl = normalizeUrl(validatedUrl);
  const sourceDomain = normalizeOptional(body.sourceDomain) ?? getDomainFromUrl(normalizedUrl);
  const pageTitle = normalizeOptional(body.pageTitle);
  const rawText = normalizeOptional(body.rawText);

  validateLength(normalizedUrl, 2000, "sourceUrl");
  validateLength(sourceDomain, 255, "sourceDomain");
  validateLength(pageTitle, 300, "pageTitle");
  validateLength(rawText, 100000, "rawText");

  if (!normalizedUrl && !pageTitle && !rawText) {
    throw new Error("Provide sourceUrl, pageTitle, or rawText.");
  }

  return {
    sourceUrl: normalizedUrl,
    fetchUrl: validatedUrl,
    sourceDomain,
    pageTitle,
    rawText,
    debug: body.debug === true || body.debug === "true",
  };
}

export function validateParserPayload(req, res, next) {
  try {
    req.validatedParserPayload = normalizeParserPayload(req.body);
    return next();
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

export function validateCreateDraftPayload(req, res, next) {
  try {
    const captureId = normalizeOptional(req.get("Idempotency-Key"));
    if (captureId && !CAPTURE_ID_PATTERN.test(captureId)) {
      throw new Error("Idempotency-Key must be a valid capture ID.");
    }
    req.validatedImportDraft = { ...normalizeParserPayload(req.body), captureId };
    return next();
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

export function validateConvertDraftPayload(req, res, next) {
  try {
    const sourceUrl = normalizeOptional(req.body.sourceUrl);
    const validatedUrl = validateUrl(sourceUrl, "sourceUrl");
    const salaryMin = parseOptionalInt(req.body.salaryMin, "salaryMin");
    const salaryMax = parseOptionalInt(req.body.salaryMax, "salaryMax");

    if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
      throw new Error("salaryMin cannot be greater than salaryMax.");
    }

    const status = req.body.status === undefined || req.body.status === null || req.body.status === "" ? undefined : req.body.status;
    if (status !== undefined && !APP_STATUSES.has(status)) {
      throw new Error("status is invalid.");
    }

    req.validatedImportConversion = {
      title: normalizeOptional(req.body.title),
      companyName: normalizeOptional(req.body.companyName),
      status,
      source: normalizeOptional(req.body.source),
      sourceUrl: normalizeUrl(validatedUrl),
      location: normalizeOptional(req.body.location),
      salaryMin,
      salaryMax,
      description: normalizeOptional(req.body.description),
      notes: normalizeOptional(req.body.notes),
      dateApplied: parseDate(req.body.dateApplied, "dateApplied"),
    };

    return next();
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}
