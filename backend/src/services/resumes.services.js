import crypto from "node:crypto";

import { env } from "../config/env.js";
import { getPrismaAsync } from "../db/prisma.js";
import { getResumeStorage } from "./resume-storage.services.js";

export const RESUME_ERROR_CODES = Object.freeze({
  INVALID_TYPE: "RESUME_INVALID_TYPE",
  TOO_LARGE: "RESUME_TOO_LARGE",
  QUOTA_EXCEEDED: "RESUME_QUOTA_EXCEEDED",
  DUPLICATE: "RESUME_DUPLICATE_FILE",
  UPLOAD_MISSING: "RESUME_UPLOAD_MISSING",
  INVALID_UPLOAD: "RESUME_INVALID_PDF",
  SIZE_MISMATCH: "RESUME_SIZE_MISMATCH",
  CHECKSUM_MISMATCH: "RESUME_CHECKSUM_MISMATCH",
  INVALID_STATE: "RESUME_INVALID_STATE",
  ACCESS_DENIED: "RESUME_ACCESS_DENIED",
  STORAGE_UNAVAILABLE: "RESUME_STORAGE_UNAVAILABLE",
});

export class ResumeApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "ResumeApiError";
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }
}

export const RESUME_PUBLIC_SELECT = Object.freeze({
  id: true,
  name: true,
  targetRole: true,
  originalFilename: true,
  mimeType: true,
  sizeBytes: true,
  checksum: true,
  uploadStatus: true,
  notes: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { applications: true } },
});

function publicResume(resume) {
  if (!resume) return null;
  return {
    id: resume.id,
    name: resume.name,
    targetRole: resume.targetRole ?? null,
    originalFilename: resume.originalFilename,
    mimeType: resume.mimeType,
    sizeBytes: resume.sizeBytes,
    checksum: resume.checksum ?? null,
    uploadStatus: resume.uploadStatus,
    notes: resume.notes ?? null,
    archivedAt: resume.archivedAt ?? null,
    applicationCount: resume._count?.applications ?? 0,
    createdAt: resume.createdAt,
    updatedAt: resume.updatedAt,
  };
}

function apiError(status, code, message, details) {
  return new ResumeApiError(status, code, message, details);
}

function accessDenied() {
  return apiError(404, RESUME_ERROR_CODES.ACCESS_DENIED, "Resume not found.");
}

function isUniqueConstraintError(error) {
  return error?.code === "P2002";
}

function isStorageNotFound(error) {
  return error?.name === "NotFound" || error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404;
}

function normalizeStoredChecksum(value) {
  if (!value) return null;
  const normalized = String(value).replace(/^"|"$/g, "").trim();
  if (/^[a-f0-9]{64}$/i.test(normalized)) return normalized.toLowerCase();

  try {
    const bytes = Buffer.from(normalized, "base64");
    return bytes.length === 32 ? bytes.toString("hex") : null;
  } catch {
    return null;
  }
}

async function dependencies(overrides = {}) {
  return {
    prisma: overrides.prisma ?? (await getPrismaAsync()),
    storage: overrides.storage ?? getResumeStorage(),
    now: overrides.now ?? (() => new Date()),
    randomId: overrides.randomId ?? (() => crypto.randomUUID()),
    randomKeyPart: overrides.randomKeyPart ?? (() => crypto.randomBytes(18).toString("hex")),
    maxBytes: overrides.maxBytes ?? env.RESUME_UPLOAD_MAX_BYTES,
    quota: overrides.quota ?? env.RESUME_ACTIVE_LIMIT,
    signedUrlTtlSeconds: overrides.signedUrlTtlSeconds ?? env.RESUME_SIGNED_URL_TTL_SECONDS,
  };
}

export function buildOwnedResumeWhere(userId, id) {
  if (!userId || !id) throw new TypeError("A user ID and resume ID are required.");
  return { id, userId };
}

export function buildResumeListWhere(userId, { includeArchived = false } = {}) {
  const where = { userId, uploadStatus: "READY" };
  if (!includeArchived) where.archivedAt = null;
  return where;
}

export function isResumeUploadTransitionAllowed(from, to) {
  return from === "PENDING" && (to === "READY" || to === "FAILED");
}

export function buildResumeStorageKey(userId, resumeId, entropy = crypto.randomBytes(18).toString("hex")) {
  const safeIdPattern = /^[a-zA-Z0-9_-]+$/;
  if (!safeIdPattern.test(userId) || !safeIdPattern.test(resumeId) || !/^[a-f0-9]{16,}$/i.test(entropy)) {
    throw new TypeError("Valid user, resume, and entropy values are required to build a resume key.");
  }
  return `users/${userId}/resumes/${resumeId}/${entropy}.pdf`;
}

async function lockUserForResumeWrite(prisma, userId) {
  if (typeof prisma.$queryRaw === "function") {
    await prisma.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  }
}

async function removePendingRecord(prisma, resume) {
  await prisma.resumeVersion.deleteMany({
    where: { ...buildOwnedResumeWhere(resume.userId, resume.id), uploadStatus: "PENDING" },
  });
}

async function cleanRejectedUpload(prisma, storage, resume) {
  try {
    await storage.deleteObject(resume.storageKey);
    await removePendingRecord(prisma, resume);
  } catch {
    await prisma.resumeVersion.updateMany({
      where: { ...buildOwnedResumeWhere(resume.userId, resume.id), uploadStatus: "PENDING" },
      data: { uploadStatus: "FAILED", checksum: null },
    });
  }
}

async function rejectCompletedUpload(deps, resume, error) {
  await cleanRejectedUpload(deps.prisma, deps.storage, resume);
  throw error;
}

export async function listResumes(userId, query = {}, overrides) {
  const { prisma } = await dependencies(overrides);
  const resumes = await prisma.resumeVersion.findMany({
    where: buildResumeListWhere(userId, query),
    select: RESUME_PUBLIC_SELECT,
    orderBy: [{ archivedAt: "asc" }, { createdAt: "desc" }],
  });
  return resumes.map(publicResume);
}

export async function getResume(userId, id, overrides) {
  const { prisma } = await dependencies(overrides);
  const resume = await prisma.resumeVersion.findFirst({
    where: buildOwnedResumeWhere(userId, id),
    select: RESUME_PUBLIC_SELECT,
  });
  return publicResume(resume);
}

export async function initiateResumeUpload(userId, payload, overrides) {
  const deps = await dependencies(overrides);
  if (payload.mimeType !== "application/pdf" || !payload.originalFilename.toLowerCase().endsWith(".pdf")) {
    throw apiError(400, RESUME_ERROR_CODES.INVALID_TYPE, "Only PDF uploads are supported.");
  }
  if (payload.sizeBytes > deps.maxBytes) {
    throw apiError(413, RESUME_ERROR_CODES.TOO_LARGE, `Resume files cannot exceed ${deps.maxBytes} bytes.`);
  }

  const id = deps.randomId();
  const storageKey = buildResumeStorageKey(userId, id, deps.randomKeyPart());
  let resume;

  try {
    resume = await deps.prisma.$transaction(async (tx) => {
      await lockUserForResumeWrite(tx, userId);

      const activeCount = await tx.resumeVersion.count({
        where: {
          userId,
          archivedAt: null,
          uploadStatus: { in: ["PENDING", "READY"] },
        },
      });
      if (activeCount >= deps.quota) {
        throw apiError(
          409,
          RESUME_ERROR_CODES.QUOTA_EXCEEDED,
          `The active resume limit of ${deps.quota} has been reached.`,
        );
      }

      if (payload.checksum) {
        const duplicate = await tx.resumeVersion.findFirst({
          where: { userId, checksum: payload.checksum },
          select: { id: true },
        });
        if (duplicate) {
          throw apiError(409, RESUME_ERROR_CODES.DUPLICATE, "This resume file has already been uploaded.");
        }
      }

      return tx.resumeVersion.create({
        data: {
          id,
          userId,
          name: payload.name,
          targetRole: payload.targetRole,
          storageKey,
          originalFilename: payload.originalFilename,
          mimeType: payload.mimeType,
          sizeBytes: payload.sizeBytes,
          checksum: payload.checksum,
          uploadStatus: "PENDING",
          notes: payload.notes,
        },
      });
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw apiError(409, RESUME_ERROR_CODES.DUPLICATE, "This resume file has already been uploaded.");
    }
    throw error;
  }

  let uploadUrl;
  try {
    uploadUrl = await deps.storage.presignUpload({
      key: storageKey,
      contentType: payload.mimeType,
      expiresInSeconds: deps.signedUrlTtlSeconds,
    });
  } catch {
    await removePendingRecord(deps.prisma, resume);
    throw apiError(503, RESUME_ERROR_CODES.STORAGE_UNAVAILABLE, "Resume storage is temporarily unavailable.");
  }

  return {
    resume: publicResume(resume),
    objectKey: storageKey,
    uploadUrl,
    expiresInSeconds: deps.signedUrlTtlSeconds,
    requiredHeaders: { "Content-Type": payload.mimeType },
  };
}

export async function completeResumeUpload(userId, id, overrides) {
  const deps = await dependencies(overrides);
  const resume = await deps.prisma.resumeVersion.findFirst({
    where: buildOwnedResumeWhere(userId, id),
  });
  if (!resume) throw accessDenied();
  if (!isResumeUploadTransitionAllowed(resume.uploadStatus, "READY")) {
    throw apiError(409, RESUME_ERROR_CODES.INVALID_STATE, "Only pending uploads can be completed.");
  }

  let metadata;
  try {
    metadata = await deps.storage.inspectObject(resume.storageKey);
  } catch {
    throw apiError(503, RESUME_ERROR_CODES.STORAGE_UNAVAILABLE, "Resume storage is temporarily unavailable.");
  }
  if (!metadata) {
    return rejectCompletedUpload(
      deps,
      resume,
      apiError(404, RESUME_ERROR_CODES.UPLOAD_MISSING, "The uploaded resume object was not found."),
    );
  }
  if (!Number.isSafeInteger(metadata.sizeBytes) || metadata.sizeBytes < 1) {
    return rejectCompletedUpload(
      deps,
      resume,
      apiError(422, RESUME_ERROR_CODES.SIZE_MISMATCH, "The uploaded resume size is invalid."),
    );
  }
  if (metadata.sizeBytes > deps.maxBytes) {
    return rejectCompletedUpload(
      deps,
      resume,
      apiError(413, RESUME_ERROR_CODES.TOO_LARGE, `Resume files cannot exceed ${deps.maxBytes} bytes.`),
    );
  }
  if (metadata.sizeBytes !== resume.sizeBytes) {
    return rejectCompletedUpload(
      deps,
      resume,
      apiError(422, RESUME_ERROR_CODES.SIZE_MISMATCH, "The uploaded resume size does not match its declaration."),
    );
  }
  if (String(metadata.contentType ?? "").toLowerCase() !== "application/pdf") {
    return rejectCompletedUpload(
      deps,
      resume,
      apiError(400, RESUME_ERROR_CODES.INVALID_TYPE, "The uploaded object is not a PDF."),
    );
  }

  let header;
  try {
    header = await deps.storage.readObjectRange(resume.storageKey, { start: 0, end: 4 });
  } catch (error) {
    if (isStorageNotFound(error)) {
      return rejectCompletedUpload(
        deps,
        resume,
        apiError(404, RESUME_ERROR_CODES.UPLOAD_MISSING, "The uploaded resume object was not found."),
      );
    }
    throw apiError(503, RESUME_ERROR_CODES.STORAGE_UNAVAILABLE, "Resume storage is temporarily unavailable.");
  }
  if (!Buffer.isBuffer(header) || header.toString("ascii") !== "%PDF-") {
    return rejectCompletedUpload(
      deps,
      resume,
      apiError(422, RESUME_ERROR_CODES.INVALID_UPLOAD, "The uploaded file is not a valid PDF."),
    );
  }

  const storedChecksum = normalizeStoredChecksum(metadata.checksumSha256);
  if (storedChecksum && resume.checksum && storedChecksum !== resume.checksum) {
    return rejectCompletedUpload(
      deps,
      resume,
      apiError(422, RESUME_ERROR_CODES.CHECKSUM_MISMATCH, "The uploaded resume checksum does not match."),
    );
  }
  const verifiedChecksum = storedChecksum ?? resume.checksum;

  if (verifiedChecksum) {
    const duplicate = await deps.prisma.resumeVersion.findFirst({
      where: { userId, checksum: verifiedChecksum, id: { not: id } },
      select: { id: true },
    });
    if (duplicate) {
      return rejectCompletedUpload(
        deps,
        resume,
        apiError(409, RESUME_ERROR_CODES.DUPLICATE, "This resume file has already been uploaded."),
      );
    }
  }

  try {
    const updated = await deps.prisma.resumeVersion.updateMany({
      where: { ...buildOwnedResumeWhere(userId, id), uploadStatus: "PENDING" },
      data: { uploadStatus: "READY", sizeBytes: metadata.sizeBytes, checksum: verifiedChecksum },
    });
    if (updated.count !== 1) {
      throw apiError(409, RESUME_ERROR_CODES.INVALID_STATE, "Only pending uploads can be completed.");
    }
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return rejectCompletedUpload(
        deps,
        resume,
        apiError(409, RESUME_ERROR_CODES.DUPLICATE, "This resume file has already been uploaded."),
      );
    }
    throw error;
  }

  const completed = await deps.prisma.resumeVersion.findFirst({
    where: buildOwnedResumeWhere(userId, id),
    select: RESUME_PUBLIC_SELECT,
  });
  return publicResume(completed);
}

export async function createResumeDownloadUrl(userId, id, overrides) {
  const deps = await dependencies(overrides);
  const resume = await deps.prisma.resumeVersion.findFirst({
    where: buildOwnedResumeWhere(userId, id),
  });
  if (!resume) throw accessDenied();
  if (resume.uploadStatus !== "READY") {
    throw apiError(409, RESUME_ERROR_CODES.INVALID_STATE, "Only completed resumes can be downloaded.");
  }

  let downloadUrl;
  try {
    downloadUrl = await deps.storage.presignDownload({
      key: resume.storageKey,
      downloadFilename: resume.originalFilename,
      expiresInSeconds: deps.signedUrlTtlSeconds,
    });
  } catch {
    throw apiError(503, RESUME_ERROR_CODES.STORAGE_UNAVAILABLE, "Resume storage is temporarily unavailable.");
  }
  return { downloadUrl, expiresInSeconds: deps.signedUrlTtlSeconds };
}

export async function updateResume(userId, id, payload, overrides) {
  const deps = await dependencies(overrides);
  const existing = await deps.prisma.resumeVersion.findFirst({
    where: buildOwnedResumeWhere(userId, id),
    select: { id: true, uploadStatus: true },
  });
  if (!existing) throw accessDenied();
  if (existing.uploadStatus !== "READY") {
    throw apiError(409, RESUME_ERROR_CODES.INVALID_STATE, "Only completed resumes can be updated.");
  }

  const data = {};
  for (const field of ["name", "targetRole", "notes"]) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) data[field] = payload[field];
  }
  if (Object.prototype.hasOwnProperty.call(payload, "archived")) {
    data.archivedAt = payload.archived ? deps.now() : null;
  }

  const updated = await deps.prisma.resumeVersion.updateMany({
    where: { ...buildOwnedResumeWhere(userId, id), uploadStatus: "READY" },
    data,
  });
  if (updated.count !== 1) throw accessDenied();

  return getResume(userId, id, { ...overrides, prisma: deps.prisma, storage: deps.storage });
}
