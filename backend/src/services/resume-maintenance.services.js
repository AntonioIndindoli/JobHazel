import { env } from "../config/env.js";
import { getPrismaAsync } from "../db/prisma.js";
import { getResumeStorage } from "./resume-storage.services.js";

function toPublicRun(run) {
  if (!run) return null;
  return {
    id: run.id,
    status: run.status,
    scannedCount: run.scannedCount,
    deletedCount: run.deletedCount,
    failedCount: run.failedCount,
    skippedCount: run.skippedCount,
    reclaimedBytes: Number(run.reclaimedBytes),
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  };
}

function logMaintenanceSummary(summary) {
  console.info(
    "[resume-maintenance]",
    JSON.stringify({
      runId: summary.id,
      status: summary.status,
      scannedCount: summary.scannedCount,
      deletedCount: summary.deletedCount,
      failedCount: summary.failedCount,
      skippedCount: summary.skippedCount,
      reclaimedBytes: summary.reclaimedBytes,
    }),
  );
}

async function lockResume(tx, resumeId) {
  if (typeof tx.$queryRaw === "function") {
    await tx.$queryRaw`SELECT "id" FROM "ResumeVersion" WHERE "id" = ${resumeId} FOR UPDATE`;
  }
}

async function cleanupCandidate(prisma, storage, candidate, staleBefore) {
  return prisma.$transaction(async (tx) => {
    await lockResume(tx, candidate.id);
    const current = await tx.resumeVersion.findFirst({
      where: {
        id: candidate.id,
        userId: candidate.userId,
        uploadStatus: { in: ["PENDING", "FAILED"] },
        updatedAt: { lte: staleBefore },
      },
      select: {
        id: true,
        userId: true,
        storageKey: true,
        sizeBytes: true,
      },
    });
    if (!current) return { outcome: "skipped", reclaimedBytes: 0 };

    await storage.deleteObject(current.storageKey);
    const deleted = await tx.resumeVersion.deleteMany({
      where: {
        id: current.id,
        userId: current.userId,
        uploadStatus: { in: ["PENDING", "FAILED"] },
      },
    });
    if (deleted.count !== 1) return { outcome: "skipped", reclaimedBytes: 0 };
    return { outcome: "deleted", reclaimedBytes: current.sizeBytes };
  });
}

export async function cleanupAbandonedResumeUploads(overrides = {}) {
  const prisma = overrides.prisma ?? (await getPrismaAsync());
  const storage = overrides.storage ?? getResumeStorage();
  const now = overrides.now ?? new Date();
  const staleHours = overrides.staleHours ?? env.RESUME_CLEANUP_STALE_HOURS;
  const batchSize = overrides.batchSize ?? env.RESUME_CLEANUP_BATCH_SIZE;
  const staleBefore = new Date(now.getTime() - staleHours * 60 * 60 * 1000);
  const run = await prisma.resumeCleanupRun.create({
    data: { status: "RUNNING", startedAt: now },
  });

  try {
    const candidates = await prisma.resumeVersion.findMany({
      where: {
        uploadStatus: { in: ["PENDING", "FAILED"] },
        updatedAt: { lte: staleBefore },
      },
      select: { id: true, userId: true, storageKey: true, sizeBytes: true },
      orderBy: { updatedAt: "asc" },
      take: batchSize,
    });

    let deletedCount = 0;
    let skippedCount = 0;
    let reclaimedBytes = 0;
    const failureResumeIds = [];

    for (const candidate of candidates) {
      try {
        const result = await cleanupCandidate(prisma, storage, candidate, staleBefore);
        if (result.outcome === "deleted") {
          deletedCount += 1;
          reclaimedBytes += result.reclaimedBytes;
        } else {
          skippedCount += 1;
        }
      } catch {
        failureResumeIds.push(candidate.id);
      }
    }

    const status = failureResumeIds.length ? "PARTIAL" : "COMPLETED";
    const completed = await prisma.resumeCleanupRun.update({
      where: { id: run.id },
      data: {
        status,
        scannedCount: candidates.length,
        deletedCount,
        failedCount: failureResumeIds.length,
        skippedCount,
        reclaimedBytes: BigInt(reclaimedBytes),
        failureResumeIds: failureResumeIds.length ? failureResumeIds : null,
        completedAt: now,
      },
    });
    const summary = toPublicRun(completed);
    logMaintenanceSummary(summary);
    return summary;
  } catch (error) {
    const failed = await prisma.resumeCleanupRun.update({
      where: { id: run.id },
      data: { status: "FAILED", completedAt: now },
    });
    logMaintenanceSummary(toPublicRun(failed));
    throw error;
  }
}

export async function getResumeMaintenanceStatus(overrides = {}) {
  const prisma = overrides.prisma ?? (await getPrismaAsync());
  const now = overrides.now ?? new Date();
  const staleHours = overrides.staleHours ?? env.RESUME_CLEANUP_STALE_HOURS;
  const staleBefore = new Date(now.getTime() - staleHours * 60 * 60 * 1000);
  const [groups, staleIncompleteCount, latestRun] = await Promise.all([
    prisma.resumeVersion.groupBy({
      by: ["uploadStatus"],
      _count: { _all: true },
      _sum: { sizeBytes: true },
    }),
    prisma.resumeVersion.count({
      where: {
        uploadStatus: { in: ["PENDING", "FAILED"] },
        updatedAt: { lte: staleBefore },
      },
    }),
    prisma.resumeCleanupRun.findFirst({ orderBy: { startedAt: "desc" } }),
  ]);

  const storageByStatus = Object.fromEntries(
    groups.map((group) => [
      group.uploadStatus,
      {
        recordCount: group._count._all,
        declaredBytes: group._sum.sizeBytes ?? 0,
      },
    ]),
  );
  return {
    staleIncompleteCount,
    staleBefore,
    storageByStatus,
    latestCleanupRun: toPublicRun(latestRun),
  };
}
