import { cancelNotificationOperations, drainOperations } from "./notification-operations.services.js";
import { env } from "../config/env.js";
import { getPrismaAsync } from "../db/prisma.js";
import { getResumeStorage } from "./resume-storage.services.js";

export const ACCOUNT_RESUME_VERSION_SELECT = Object.freeze({
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
});

export async function deleteAccount(userId, password, overrides = {}) {
  const prisma = overrides.prisma ?? (await getPrismaAsync());
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || overrides.passwordVerified !== true) {
    return { status: 400, body: { message: "Password is incorrect." } };
  }

  const result = await prisma.$transaction(async (tx) => {
    if (typeof tx.$queryRaw === "function") {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    }

    const resumeObjects = await tx.resumeVersion.findMany({
      where: { userId },
      select: { id: true, storageKey: true },
    });
    let failedCleanupCount = 0;

    if (resumeObjects.length > 0) {
      let storage;
      try {
        storage = overrides.storage ?? getResumeStorage();
      } catch {
        failedCleanupCount = resumeObjects.length;
      }

      if (storage) {
        for (const resume of resumeObjects) {
          try {
            // R2 DeleteObject is idempotent, so retrying is safe when an
            // earlier attempt deleted only some objects.
            await storage.deleteObject(resume.storageKey);
          } catch {
            failedCleanupCount += 1;
          }
        }
      }
    }

    if (failedCleanupCount > 0) {
      console.info(
        "[resume-maintenance]",
        JSON.stringify({
          operation: "account-delete",
          status: "storage-cleanup-failed",
          objectCount: resumeObjects.length,
          failedCleanupCount,
        }),
      );
      return {
        status: 503,
        body: {
          code: "ACCOUNT_STORAGE_CLEANUP_FAILED",
          message: "Your account was not deleted because private file cleanup did not finish. Try again.",
        },
      };
    }

    await cancelNotificationOperations(tx, userId, {}, { erase: true });
    if (overrides.deleteIdentity) await overrides.deleteIdentity(tx);
    await tx.user.delete({ where: { id: userId } });
    return { status: 204, body: null };
  });
  if (result.status === 204 && env.NOTIFICATION_MODE !== "legacy") {
    try { await drainOperations(prisma, { allowCreate: false }); } catch { /* durable daily repair */ }
  }
  return result;
}

export async function buildAccountExport(userId) {
  const prisma = await getPrismaAsync();
  const [user, companies, applications, contacts, interviews, tasks, resumeVersions, importDrafts, activityLogs] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          autoCreateFollowUpTasks: true,
          autoCreateThankYouTasks: true,
          followUpTaskDelayDays: true,
          thankYouTaskDelayDays: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.company.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.application.findMany({
        where: { userId },
        include: {
          company: { select: { name: true } },
          resumeVersion: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.contact.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.interview.findMany({ where: { userId }, orderBy: { scheduledAt: "asc" } }),
      prisma.task.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.resumeVersion.findMany({
        where: { userId },
        select: ACCOUNT_RESUME_VERSION_SELECT,
        orderBy: { createdAt: "asc" },
      }),
      prisma.importDraft.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.activityLog.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    user,
    companies,
    applications,
    contacts,
    interviews,
    tasks,
    resumeVersions,
    importDrafts,
    activityLogs,
  };
}

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const normalized = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(normalized) ? `"${normalized.replaceAll('"', '""')}"` : normalized;
}

export function createApplicationsCsv(applications) {
  const columns = [
    ["title", (application) => application.title],
    ["company", (application) => application.company?.name],
    ["status", (application) => application.status],
    ["source", (application) => application.source],
    ["source_url", (application) => application.sourceUrl],
    ["location", (application) => application.location],
    ["workplace_type", (application) => application.workplaceType],
    ["employment_type", (application) => application.employmentType],
    ["salary_min", (application) => application.salaryMin],
    ["salary_max", (application) => application.salaryMax],
    ["currency", (application) => application.currency],
    ["priority", (application) => application.priority],
    ["date_saved", (application) => application.dateSaved],
    ["date_applied", (application) => application.dateApplied],
    ["resume_version", (application) => application.resumeVersion?.name],
    ["notes", (application) => application.notes],
    ["created_at", (application) => application.createdAt],
    ["updated_at", (application) => application.updatedAt],
  ];

  const rows = applications.map((application) =>
    columns.map(([, getValue]) => escapeCsv(getValue(application))).join(","),
  );
  return [columns.map(([header]) => header).join(","), ...rows].join("\r\n");
}
