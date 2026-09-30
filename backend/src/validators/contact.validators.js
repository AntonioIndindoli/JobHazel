const CONTACT_RELATIONSHIPS = new Set([
  "RECRUITER",
  "REFERRAL",
  "HIRING_MANAGER",
  "EMPLOYEE",
  "OTHER",
]);

function hasOwn(body, field) {
  return Object.prototype.hasOwnProperty.call(body, field);
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function normalizeEmail(value) {
  const email = normalizeOptional(value);
  if (!email) return null;

  const normalized = email.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("email must be a valid email address.");
  }
  return normalized;
}

function normalizePhone(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error("phone must be a string.");
  const phone = normalizeOptional(value);
  validateLength(phone, 50, "phone");
  return phone;
}

function normalizeHttpUrl(value, field) {
  const url = normalizeOptional(value);
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    return parsed.toString();
  } catch {
    throw new Error(`${field} must be a valid http or https URL.`);
  }
}

function validateLength(value, max, field) {
  if (value && value.length > max) throw new Error(`${field} must be ${max} characters or fewer.`);
}

function normalizeRelationship(value, { required = false } = {}) {
  const relationship = normalizeOptional(value);
  if (!relationship) {
    if (required) throw new Error("relationship cannot be empty.");
    return null;
  }
  if (!CONTACT_RELATIONSHIPS.has(relationship)) throw new Error("relationship is invalid.");
  return relationship;
}

function assertCompanyReference(body) {
  const companyId = normalizeOptional(body.companyId);
  const companyName = normalizeOptional(body.companyName);

  if (companyId && companyName) {
    throw new Error("Provide either companyId or companyName, not both.");
  }
}

function normalizeCreatePayload(body = {}) {
  assertCompanyReference(body);

  const name = normalizeOptional(body.name);
  if (!name) throw new Error("name is required.");

  const role = normalizeOptional(body.role);
  const email = normalizeEmail(body.email);
  const phone = normalizePhone(body.phone);
  const linkedinUrl = normalizeHttpUrl(body.linkedinUrl, "linkedinUrl");
  const relationship = normalizeRelationship(body.relationship) ?? "OTHER";
  const notes = normalizeOptional(body.notes);
  const companyId = normalizeOptional(body.companyId);
  const companyName = normalizeOptional(body.companyName);
  const applicationId = normalizeOptional(body.applicationId);

  validateLength(name, 255, "name");
  validateLength(role, 255, "role");
  validateLength(email, 320, "email");
  validateLength(linkedinUrl, 2000, "linkedinUrl");
  validateLength(notes, 10000, "notes");
  validateLength(companyId, 120, "companyId");
  validateLength(companyName, 255, "companyName");
  validateLength(applicationId, 120, "applicationId");

  return {
    name,
    role,
    email,
    phone,
    linkedinUrl,
    relationship,
    notes,
    companyId,
    companyName,
    applicationId,
  };
}

function normalizePatchPayload(body = {}) {
  assertCompanyReference(body);

  const payload = {};

  if (hasOwn(body, "name")) {
    const name = normalizeOptional(body.name);
    if (!name) throw new Error("name cannot be empty.");
    validateLength(name, 255, "name");
    payload.name = name;
  }

  if (hasOwn(body, "role")) {
    const role = normalizeOptional(body.role);
    validateLength(role, 255, "role");
    payload.role = role;
  }

  if (hasOwn(body, "email")) {
    const email = normalizeEmail(body.email);
    validateLength(email, 320, "email");
    payload.email = email;
  }

  if (hasOwn(body, "linkedinUrl")) {
    const linkedinUrl = normalizeHttpUrl(body.linkedinUrl, "linkedinUrl");
    validateLength(linkedinUrl, 2000, "linkedinUrl");
    payload.linkedinUrl = linkedinUrl;
  }

  if (hasOwn(body, "phone")) {
    payload.phone = normalizePhone(body.phone);
  }

  if (hasOwn(body, "relationship")) {
    payload.relationship = normalizeRelationship(body.relationship, { required: true });
  }

  if (hasOwn(body, "notes")) {
    const notes = normalizeOptional(body.notes);
    validateLength(notes, 10000, "notes");
    payload.notes = notes;
  }

  if (hasOwn(body, "companyId")) {
    const companyId = normalizeOptional(body.companyId);
    validateLength(companyId, 120, "companyId");
    payload.companyId = companyId;
  }

  if (hasOwn(body, "companyName")) {
    const companyName = normalizeOptional(body.companyName);
    validateLength(companyName, 255, "companyName");
    payload.companyName = companyName;
  }

  if (hasOwn(body, "applicationId")) {
    const applicationId = normalizeOptional(body.applicationId);
    validateLength(applicationId, 120, "applicationId");
    payload.applicationId = applicationId;
  }

  if (Object.keys(payload).length === 0) {
    throw new Error("Provide at least one contact field to update.");
  }

  return payload;
}

export function validateContactPayload(req, res, next) {
  try {
    req.validatedContact = normalizeCreatePayload(req.body);
    return next();
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

export function validateContactPatchPayload(req, res, next) {
  try {
    req.validatedContactPatch = normalizePatchPayload(req.body);
    return next();
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}
