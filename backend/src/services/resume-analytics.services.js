import { getPrismaAsync } from "../db/prisma.js";

export const RESUME_ANALYTICS_MINIMUM_SAMPLE_SIZE = 5;

const SUBMITTED_STATUSES = new Set([
  "APPLIED",
  "INTERVIEWING",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
]);
const RESPONSE_STATUSES = new Set([
  "INTERVIEWING",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
]);
const INTERVIEW_STATUSES = new Set(["INTERVIEWING", "OFFER"]);
const OFFER_STATUSES = new Set(["OFFER"]);
const NO_RESUME_KEY = "__no_resume__";

function metadataStatus(metadata, field) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata[field];
  return typeof value === "string" ? value : null;
}

function observedStatuses(application, history = []) {
  const statuses = new Set([application.status]);
  for (const entry of history) {
    if (entry.type === "APPLICATION_CREATED") {
      const status = metadataStatus(entry.metadata, "status");
      if (status) statuses.add(status);
    }
    if (entry.type === "STATUS_CHANGED") {
      const from = metadataStatus(entry.metadata, "from");
      const to = metadataStatus(entry.metadata, "to");
      if (from) statuses.add(from);
      if (to) statuses.add(to);
    }
  }
  return statuses;
}

function reachedAny(statuses, candidates) {
  return [...statuses].some((status) => candidates.has(status));
}

function percentage(count, total) {
  return total ? Math.round((count / total) * 100) : 0;
}

export function buildResumeAnalyticsRows({
  applications,
  histories,
  resumes,
  minimumSampleSize = RESUME_ANALYTICS_MINIMUM_SAMPLE_SIZE,
}) {
  const historyByApplication = histories.reduce((groups, entry) => {
    const group = groups.get(entry.applicationId) ?? [];
    group.push(entry);
    groups.set(entry.applicationId, group);
    return groups;
  }, new Map());

  const rows = new Map(
    resumes.map((resume) => [
      resume.id,
      {
        resumeVersionId: resume.id,
        name: resume.name,
        targetRole: resume.targetRole ?? null,
        archivedAt: resume.archivedAt ?? null,
        isNoResume: false,
        submittedApplications: 0,
        responses: 0,
        interviews: 0,
        offers: 0,
      },
    ]),
  );

  for (const application of applications) {
    const statuses = observedStatuses(
      application,
      historyByApplication.get(application.id) ?? [],
    );
    if (!reachedAny(statuses, SUBMITTED_STATUSES)) continue;

    const key = rows.has(application.resumeVersionId)
      ? application.resumeVersionId
      : NO_RESUME_KEY;
    if (!rows.has(key)) {
      rows.set(key, {
        resumeVersionId: null,
        name: "No resume or deleted version",
        targetRole: null,
        archivedAt: null,
        isNoResume: true,
        submittedApplications: 0,
        responses: 0,
        interviews: 0,
        offers: 0,
      });
    }

    const row = rows.get(key);
    row.submittedApplications += 1;
    if (reachedAny(statuses, RESPONSE_STATUSES)) row.responses += 1;
    if (application.interviews?.length || reachedAny(statuses, INTERVIEW_STATUSES)) {
      row.interviews += 1;
    }
    if (reachedAny(statuses, OFFER_STATUSES)) row.offers += 1;
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      responseRate: percentage(row.responses, row.submittedApplications),
      interviewRate: percentage(row.interviews, row.submittedApplications),
      offerRate: percentage(row.offers, row.submittedApplications),
      eligibleForComparison: row.submittedApplications >= minimumSampleSize,
    }))
    .sort(
      (left, right) =>
        right.submittedApplications - left.submittedApplications ||
        Number(left.isNoResume) - Number(right.isNoResume) ||
        left.name.localeCompare(right.name),
    );
}

export async function getResumeAnalytics(userId) {
  const prisma = await getPrismaAsync();
  const [resumes, applications, histories] = await Promise.all([
    prisma.resumeVersion.findMany({
      where: { userId, uploadStatus: "READY" },
      select: { id: true, name: true, targetRole: true, archivedAt: true },
    }),
    prisma.application.findMany({
      where: { userId },
      select: {
        id: true,
        resumeVersionId: true,
        status: true,
        interviews: { select: { id: true } },
      },
    }),
    prisma.activityLog.findMany({
      where: { userId },
      select: { applicationId: true, type: true, metadata: true },
    }),
  ]);

  return {
    minimumSampleSize: RESUME_ANALYTICS_MINIMUM_SAMPLE_SIZE,
    rows: buildResumeAnalyticsRows({ applications, histories, resumes }),
  };
}
