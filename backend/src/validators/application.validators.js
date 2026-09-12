const APP_STATUSES = new Set([
  "SAVED",
  "APPLIED",
  "INTERVIEWING",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
]);

const RESUME_ASSOCIATION_FIELDS = new Set(["resumeVersionId"]);

function normalizeOptional(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function parseDate(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date.`);
  return date;
}

function parseOptionalInt(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${field} must be an integer.`);
  if (parsed < 0 || parsed > 1000000) throw new Error(`${field} is outside the allowed range.`);
  return parsed;
}

export function validateApplicationPayload(req, res, next) {
  try {
    const title = normalizeOptional(req.body.title);
    if (!title) return res.status(400).json({ message: "title is required." });

    const status = req.body.status ?? "APPLIED";
    if (!APP_STATUSES.has(status)) return res.status(400).json({ message: "status is invalid." });

    const salaryMin = parseOptionalInt(req.body.salaryMin, "salaryMin");
    const salaryMax = parseOptionalInt(req.body.salaryMax, "salaryMax");
    if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
      return res.status(400).json({ message: "salaryMin cannot be greater than salaryMax." });
    }

    req.validatedApplication = {
      title,
      status,
      companyName: normalizeOptional(req.body.companyName),
      source: normalizeOptional(req.body.source),
      sourceUrl: normalizeOptional(req.body.sourceUrl),
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

export function validateStatusTransition(req, res, next) {
  const status = req.body?.status;
  if (!status || !APP_STATUSES.has(status)) {
    return res.status(400).json({ message: "status is invalid." });
  }
  req.validatedStatusTransition = { status };
  return next();
}

export function validateApplicationResumeAssociation(req, _res, next) {
  const source = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const issues = [];

  for (const field of Object.keys(source)) {
    if (!RESUME_ASSOCIATION_FIELDS.has(field)) {
      issues.push({ path: field, message: `${field} is not an allowed field.` });
    }
  }

  if (!Object.prototype.hasOwnProperty.call(source, "resumeVersionId")) {
    issues.push({ path: "resumeVersionId", message: "resumeVersionId is required." });
  } else if (
    source.resumeVersionId !== null &&
    (typeof source.resumeVersionId !== "string" || !source.resumeVersionId.trim())
  ) {
    issues.push({ path: "resumeVersionId", message: "resumeVersionId must be a non-empty string or null." });
  }

  if (issues.length) {
    const error = new Error("Invalid resume association payload.");
    error.status = 400;
    error.details = issues;
    return next(error);
  }

  req.validatedResumeAssociation = {
    resumeVersionId: source.resumeVersionId === null ? null : source.resumeVersionId.trim(),
  };
  return next();
}
