const PDF_MIME_TYPE = "application/pdf";
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;
const UPLOAD_FIELDS = new Set([
  "name",
  "targetRole",
  "originalFilename",
  "mimeType",
  "sizeBytes",
  "checksum",
  "notes",
]);
const PATCH_FIELDS = new Set(["name", "targetRole", "notes", "archived"]);

function resultSuccess(data) {
  return { success: true, data };
}

function resultError(issues) {
  return { success: false, error: { issues } };
}

function normalizeRequiredString(value, field, maxLength, issues) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    issues.push({ path: [field], message: `${field} is required.` });
  } else if (normalized.length > maxLength) {
    issues.push({ path: [field], message: `${field} must be ${maxLength} characters or less.` });
  }
  return normalized;
}

function normalizeOptionalString(value, field, maxLength, issues) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    issues.push({ path: [field], message: `${field} must be ${maxLength} characters or less.` });
  }
  return normalized;
}

function normalizeFilename(value, issues) {
  const raw = normalizeRequiredString(value, "originalFilename", 255, issues);
  const filename = raw
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();

  if (raw && !filename) {
    issues.push({ path: ["originalFilename"], message: "originalFilename is invalid." });
  } else if (filename && !filename.toLowerCase().endsWith(".pdf")) {
    issues.push({ path: ["originalFilename"], message: "originalFilename must use the .pdf extension." });
  }

  return filename ?? "";
}

function rejectUnknownFields(input, allowed, issues) {
  for (const field of Object.keys(input)) {
    if (!allowed.has(field)) {
      issues.push({ path: [field], message: `${field} is not an allowed field.` });
    }
  }
}

export const resumeUploadSchema = {
  safeParse(input = {}) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const issues = [];
    rejectUnknownFields(source, UPLOAD_FIELDS, issues);

    const name = normalizeRequiredString(source.name, "name", 150, issues);
    const targetRole = normalizeOptionalString(source.targetRole, "targetRole", 150, issues);
    const originalFilename = normalizeFilename(source.originalFilename, issues);
    const mimeType = typeof source.mimeType === "string" ? source.mimeType.trim().toLowerCase() : "";
    if (mimeType !== PDF_MIME_TYPE) {
      issues.push({ path: ["mimeType"], message: "Only PDF uploads are supported." });
    }

    const sizeBytes = source.sizeBytes;
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1) {
      issues.push({ path: ["sizeBytes"], message: "sizeBytes must be a positive integer." });
    }

    let checksum = null;
    if (source.checksum !== undefined && source.checksum !== null && source.checksum !== "") {
      checksum = String(source.checksum).trim().toLowerCase();
      if (!SHA256_HEX_PATTERN.test(checksum)) {
        issues.push({ path: ["checksum"], message: "checksum must be a SHA-256 hexadecimal digest." });
      }
    }

    const notes = normalizeOptionalString(source.notes, "notes", 5000, issues);
    return issues.length
      ? resultError(issues)
      : resultSuccess({ name, targetRole, originalFilename, mimeType, sizeBytes, checksum, notes });
  },
};

export const resumePatchSchema = {
  safeParse(input = {}) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const issues = [];
    const data = {};
    rejectUnknownFields(source, PATCH_FIELDS, issues);

    if (Object.keys(source).length === 0) {
      issues.push({ path: [], message: "Provide at least one resume field to update." });
    }

    if (Object.prototype.hasOwnProperty.call(source, "name")) {
      data.name = normalizeRequiredString(source.name, "name", 150, issues);
    }
    if (Object.prototype.hasOwnProperty.call(source, "targetRole")) {
      data.targetRole = normalizeOptionalString(source.targetRole, "targetRole", 150, issues);
    }
    if (Object.prototype.hasOwnProperty.call(source, "notes")) {
      data.notes = normalizeOptionalString(source.notes, "notes", 5000, issues);
    }
    if (Object.prototype.hasOwnProperty.call(source, "archived")) {
      if (typeof source.archived !== "boolean") {
        issues.push({ path: ["archived"], message: "archived must be a boolean." });
      } else {
        data.archived = source.archived;
      }
    }

    return issues.length ? resultError(issues) : resultSuccess(data);
  },
};

export const resumeListQuerySchema = {
  safeParse(input = {}) {
    const value = input?.includeArchived;
    if (value === undefined || value === "false" || value === "0" || value === false) {
      return resultSuccess({ includeArchived: false });
    }
    if (value === "true" || value === "1" || value === true) {
      return resultSuccess({ includeArchived: true });
    }
    return resultError([
      { path: ["includeArchived"], message: "includeArchived must be true or false." },
    ]);
  },
};

export function validateResumeListQuery(req, _res, next) {
  const parsed = resumeListQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    const error = new Error("Invalid request query.");
    error.status = 400;
    error.details = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return next(error);
  }

  req.validatedResumeListQuery = parsed.data;
  return next();
}

export function validateResumeUploadPayload(req, _res, next) {
  const parsed = resumeUploadSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const paths = parsed.error.issues.map((issue) => issue.path.join("."));
    const error = new Error("Invalid resume upload metadata.");
    error.status = 400;
    error.code = paths.some((path) => path === "mimeType" || path === "originalFilename")
      ? "RESUME_INVALID_TYPE"
      : "RESUME_INVALID_METADATA";
    error.details = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return next(error);
  }

  req.body = parsed.data;
  return next();
}

export const RESUME_PDF_MIME_TYPE = PDF_MIME_TYPE;
