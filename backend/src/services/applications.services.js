import { markNotificationDirty, cancelNotificationOperations, flushUserNotifications } from "./notification-operations.services.js";
import { getPrismaAsync } from "../db/prisma.js";
import { normalizeUrl } from "../utils/url.js";
import { maybeCreateAppliedFollowUpTask } from "./tasks.services.js";

export const APPLICATION_RESUME_SUMMARY_SELECT = Object.freeze({
  id: true,
  name: true,
  targetRole: true,
  originalFilename: true,
  uploadStatus: true,
  archivedAt: true,
});

export const APPLICATION_INCLUDE = Object.freeze({
  company: { select: { name: true } },
  resumeVersion: { select: APPLICATION_RESUME_SUMMARY_SELECT },
});

export const APPLICATION_RESUME_ERROR_CODES = Object.freeze({
  ACCESS_DENIED: "APPLICATION_RESUME_ACCESS_DENIED",
  INVALID_STATE: "APPLICATION_RESUME_INVALID_STATE",
  ARCHIVED: "APPLICATION_RESUME_ARCHIVED",
});

class ApplicationResumeApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function logActivity(prisma, userId, applicationId, type, message, metadata = null) {
  await prisma.activityLog.create({
    data: { userId, applicationId, type, message, metadata },
  });
}

function buildFilters(query) {
  const where = {};
  if (query.status) where.status = query.status;
  if (query.source) where.source = { equals: query.source, mode: "insensitive" };
  if (query.company) where.company = { name: { contains: query.company, mode: "insensitive" } };

  if (query.startDate || query.endDate) {
    where.createdAt = {};
    if (query.startDate) where.createdAt.gte = new Date(query.startDate);
    if (query.endDate) where.createdAt.lte = new Date(query.endDate);
  }

  return where;
}

function publicResumeSummary(resume) {
  if (!resume) return null;
  return {
    id: resume.id,
    name: resume.name,
    targetRole: resume.targetRole ?? null,
    originalFilename: resume.originalFilename,
    uploadStatus: resume.uploadStatus,
    archivedAt: resume.archivedAt ?? null,
  };
}

async function lockUserForResumeAssociation(prisma, userId) {
  if (typeof prisma.$queryRaw === "function") {
    await prisma.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  }
}

export function withApplicationRelations(application) {
  return {
    ...application,
    companyName: application.company?.name ?? null,
    resumeVersion: publicResumeSummary(application.resumeVersion),
  };
}

export async function listApplications(userId, query) {
  const prisma = await getPrismaAsync();
  const items = await prisma.application.findMany({
    where: { userId, ...buildFilters(query) },
    include: APPLICATION_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return items.map(withApplicationRelations);
}

export async function getApplication(userId, id) {
  const prisma = await getPrismaAsync();
  const item = await prisma.application.findFirst({ where: { id, userId }, include: APPLICATION_INCLUDE });
  return item ? withApplicationRelations(item) : null;
}

export async function getApplicationHistory(userId, id) {
  const prisma = await getPrismaAsync();
  const app = await prisma.application.findFirst({ where: { id, userId }, select: { id: true } });
  if (!app) return null;
  return prisma.activityLog.findMany({ where: { userId, applicationId: id }, orderBy: { createdAt: "desc" } });
}

export async function deleteApplicationHistoryEvent(userId, applicationId, activityLogId) {
  const prisma = await getPrismaAsync();
  const result = await prisma.activityLog.deleteMany({
    where: { id: activityLogId, userId, applicationId },
  });

  return result.count > 0;
}

export async function listApplicationHistories(userId) {
  const prisma = await getPrismaAsync();
  const logs = await prisma.activityLog.findMany({
    where: { userId },
    orderBy: [{ applicationId: "asc" }, { createdAt: "desc" }],
  });

  return logs.reduce((historyByApp, entry) => {
    if (!historyByApp[entry.applicationId]) historyByApp[entry.applicationId] = [];
    historyByApp[entry.applicationId].push(entry);
    return historyByApp;
  }, {});
}

async function detectDuplicates(prisma, userId, payload, excludeId) {
  const normalizedUrl = normalizeUrl(payload.sourceUrl);
  const where = [{ userId }];
  if (excludeId) where.push({ id: { not: excludeId } });

  const candidates = await prisma.application.findMany({
    where: { AND: where },
    include: APPLICATION_INCLUDE,
  });

  return candidates.filter((app) => {
    const byUrl = normalizedUrl && normalizeUrl(app.sourceUrl) === normalizedUrl;
    const byCompanyTitle =
      payload.companyName &&
      app.company?.name &&
      app.title &&
      app.company.name.trim().toLowerCase() === payload.companyName.trim().toLowerCase() &&
      app.title.trim().toLowerCase() === payload.title.trim().toLowerCase();
    return Boolean(byUrl || byCompanyTitle);
  });
}

export async function createApplication(userId, payload) {
  const prisma = await getPrismaAsync();
  const duplicates = await detectDuplicates(prisma, userId, payload);
  if (duplicates.length) return { duplicateCandidates: duplicates.map(withApplicationRelations) };

  return prisma.$transaction(async (tx) => {
    const company = payload.companyName
      ? await tx.company.upsert({
          where: { userId_name: { userId, name: payload.companyName } },
          create: { userId, name: payload.companyName },
          update: {},
        })
      : null;
    const application = await tx.application.create({
      data: {
        userId,
        companyId: company?.id,
        title: payload.title,
        status: payload.status,
        source: payload.source,
        sourceUrl: normalizeUrl(payload.sourceUrl),
        location: payload.location,
        salaryMin: payload.salaryMin,
        salaryMax: payload.salaryMax,
        description: payload.description,
        notes: payload.notes,
        dateApplied: payload.dateApplied,
      },
      include: APPLICATION_INCLUDE,
    });

    await logActivity(tx, userId, application.id, "APPLICATION_CREATED", `Application created for ${application.title}`, {
      title: application.title,
      status: application.status,
    });

    const createdTasks = [];
    if (application.status === "APPLIED") {
      const task = await maybeCreateAppliedFollowUpTask(tx, userId, application);
      if (task) createdTasks.push(task);
    }

    return { application: withApplicationRelations(application), createdTasks };
  });
}

export async function updateApplication(userId, id, payload) {
  const prisma = await getPrismaAsync();
  const existing = await prisma.application.findFirst({ where: { id, userId }, include: APPLICATION_INCLUDE });
  if (!existing) return null;

  const duplicates = await detectDuplicates(prisma, userId, payload, id);
  if (duplicates.length) return { duplicateCandidates: duplicates.map(withApplicationRelations) };

  const result = await prisma.$transaction(async (tx) => {
    const company = payload.companyName
      ? await tx.company.upsert({
          where: { userId_name: { userId, name: payload.companyName } },
          create: { userId, name: payload.companyName },
          update: {},
        })
      : null;
    const updated = await tx.application.update({
      where: { id },
      data: {
        companyId: company?.id ?? null,
        title: payload.title,
        status: payload.status,
        source: payload.source,
        sourceUrl: normalizeUrl(payload.sourceUrl),
        location: payload.location,
        salaryMin: payload.salaryMin,
        salaryMax: payload.salaryMax,
        description: payload.description,
        notes: payload.notes,
        dateApplied: payload.dateApplied ?? (payload.status === "APPLIED" && !existing.dateApplied ? new Date() : existing.dateApplied),
      },
      include: APPLICATION_INCLUDE,
    });

    await logActivity(tx, userId, id, "APPLICATION_UPDATED", `Application updated: ${updated.title}`, {
      previous: { title: existing.title, status: existing.status, companyName: existing.company?.name ?? null },
      next: { title: updated.title, status: updated.status, companyName: updated.company?.name ?? null },
    });

    const createdTasks = [];
    if (existing.status !== updated.status) {
      await logActivity(tx, userId, id, "STATUS_CHANGED", `Status changed from ${existing.status} to ${updated.status}`, {
        from: existing.status,
        to: updated.status,
      });
      if (updated.status === "APPLIED") {
        const task = await maybeCreateAppliedFollowUpTask(tx, userId, updated);
        if (task) createdTasks.push(task);
      }
    }

    await markNotificationDirty(tx, userId);
    return { application: withApplicationRelations(updated), createdTasks };
  });
  result.notification = await flushUserNotifications(userId, { prisma });
  return result;
}

export async function transitionApplicationStatus(userId, id, status) {
  const prisma = await getPrismaAsync();
  const existing = await prisma.application.findFirst({ where: { id, userId }, include: APPLICATION_INCLUDE });
  if (!existing) return null;

  if (existing.status === status) return { application: withApplicationRelations(existing) };

  return prisma.$transaction(async (tx) => {
    const updated = await tx.application.update({
      where: { id },
      data: { status, dateApplied: status === "APPLIED" && !existing.dateApplied ? new Date() : existing.dateApplied },
      include: APPLICATION_INCLUDE,
    });
    await logActivity(tx, userId, id, "STATUS_CHANGED", `Status changed from ${existing.status} to ${status}`, {
      from: existing.status,
      to: status,
    });

    const createdTasks = [];
    if (status === "APPLIED") {
      const task = await maybeCreateAppliedFollowUpTask(tx, userId, updated);
      if (task) createdTasks.push(task);
    }

    return { application: withApplicationRelations(updated), createdTasks };
  });
}

export async function setApplicationResume(userId, id, resumeVersionId) {
  const prisma = await getPrismaAsync();

  return prisma.$transaction(async (tx) => {
    await lockUserForResumeAssociation(tx, userId);
    const existing = await tx.application.findFirst({
      where: { id, userId },
      include: APPLICATION_INCLUDE,
    });
    if (!existing) return null;

    let nextResume = null;
    if (resumeVersionId !== null) {
      nextResume = await tx.resumeVersion.findFirst({
        where: { id: resumeVersionId, userId },
        select: APPLICATION_RESUME_SUMMARY_SELECT,
      });
      if (!nextResume) {
        throw new ApplicationResumeApiError(
          404,
          APPLICATION_RESUME_ERROR_CODES.ACCESS_DENIED,
          "Resume not found.",
        );
      }
      if (nextResume.uploadStatus !== "READY") {
        throw new ApplicationResumeApiError(
          409,
          APPLICATION_RESUME_ERROR_CODES.INVALID_STATE,
          "Only completed resumes can be attached to applications.",
        );
      }
      if (nextResume.archivedAt && existing.resumeVersionId !== nextResume.id) {
        throw new ApplicationResumeApiError(
          409,
          APPLICATION_RESUME_ERROR_CODES.ARCHIVED,
          "Archived resumes cannot be selected for a new application association.",
        );
      }
    }

    if (existing.resumeVersionId === resumeVersionId) {
      return { application: withApplicationRelations(existing), changed: false };
    }

    const updated = await tx.application.update({
      where: { id },
      data: { resumeVersionId },
      include: APPLICATION_INCLUDE,
    });

    const previousResume = existing.resumeVersion;
    const type = previousResume
      ? resumeVersionId
        ? "RESUME_CHANGED"
        : "RESUME_REMOVED"
      : "RESUME_ATTACHED";
    const message =
      type === "RESUME_ATTACHED"
        ? `Resume attached: ${nextResume.name}`
        : type === "RESUME_CHANGED"
          ? `Resume changed from ${previousResume.name} to ${nextResume.name}`
          : `Resume removed: ${previousResume.name}`;

    await logActivity(tx, userId, id, type, message, {
      previousResumeVersionId: previousResume?.id ?? null,
      previousResumeName: previousResume?.name ?? null,
      nextResumeVersionId: nextResume?.id ?? null,
      nextResumeName: nextResume?.name ?? null,
    });

    return { application: withApplicationRelations(updated), changed: true };
  });
}

export async function deleteApplication(userId, id) {
  const prisma = await getPrismaAsync();
  const existing = await prisma.application.findFirst({ where: { id, userId } });
  if (!existing) return false;
  await prisma.$transaction(async (tx) => {
    const interviews = await tx.interview.findMany({ where: { userId, applicationId: id }, select: { id: true } });
    await cancelNotificationOperations(tx, userId, { kind: "INTERVIEW_REMINDER", resourceId: { in: interviews.map((item) => item.id) } });
    await markNotificationDirty(tx, userId);
    await tx.application.delete({ where: { id } });
  });
  await flushUserNotifications(userId, { prisma });
  return true;
}
