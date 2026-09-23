import { markNotificationDirty, cancelNotificationOperations, flushUserNotifications } from "./notification-operations.services.js";
import { getPrismaAsync } from "../db/prisma.js";
import { maybeCreateInterviewThankYouTask, syncInterviewThankYouTask, removePendingInterviewTasks } from "./tasks.services.js";

const INTERVIEW_INCLUDE = {
  application: {
    select: {
      id: true,
      title: true,
      status: true,
      company: { select: { name: true } },
    },
  },
};

function withCompany(application) {
  return { ...application, companyName: application.company?.name ?? null };
}

function withApplication(interview) {
  if (!interview) return null;

  return {
    ...interview,
    applicationTitle: interview.application?.title ?? null,
    companyName: interview.application?.company?.name ?? null,
  };
}

function buildInterviewWhere(userId, query = {}) {
  const where = { userId };

  if (query.applicationId) where.applicationId = String(query.applicationId);
  if (query.outcome) where.outcome = String(query.outcome);

  if (query.upcoming === "true") {
    where.scheduledAt = { gte: new Date() };
    where.outcome = "SCHEDULED";
  } else if (query.startDate || query.endDate) {
    where.scheduledAt = {};
    if (query.startDate) where.scheduledAt.gte = new Date(String(query.startDate));
    if (query.endDate) where.scheduledAt.lte = new Date(String(query.endDate));
  }

  return where;
}

function pickInterviewSnapshot(interview) {
  return {
    applicationId: interview.applicationId,
    type: interview.type,
    scheduledAt: interview.scheduledAt,
    durationMinutes: interview.durationMinutes,
    location: interview.location,
    meetingUrl: interview.meetingUrl,
    interviewerName: interview.interviewerName,
    outcome: interview.outcome,
  };
}

async function logActivity(tx, userId, applicationId, type, message, metadata = null) {
  await tx.activityLog.create({
    data: { userId, applicationId, type, message, metadata },
  });
}

export async function listInterviews(userId, query = {}) {
  const prisma = await getPrismaAsync();
  const interviews = await prisma.interview.findMany({
    where: buildInterviewWhere(userId, query),
    include: INTERVIEW_INCLUDE,
    orderBy: { scheduledAt: query.upcoming === "true" ? "asc" : "desc" },
  });

  return interviews.map(withApplication);
}

export async function createInterview(userId, payload, notificationOptions = {}) {
  const prisma = await getPrismaAsync();

  const result = await prisma.$transaction(async (tx) => {
    const application = await tx.application.findFirst({
      where: { id: payload.applicationId, userId },
      include: { company: { select: { name: true } } },
    });
    if (!application) return null;

    const interview = await tx.interview.create({
      data: {
        userId,
        applicationId: application.id,
        type: payload.type,
        scheduledAt: payload.scheduledAt,
        durationMinutes: payload.durationMinutes,
        location: payload.location,
        meetingUrl: payload.meetingUrl,
        interviewerName: payload.interviewerName,
        notes: payload.notes,
        outcome: payload.outcome,
      },
      include: INTERVIEW_INCLUDE,
    });

    await logActivity(tx, userId, application.id, "INTERVIEW_ADDED", `Interview added for ${application.title}`, {
      interviewId: interview.id,
      type: interview.type,
      scheduledAt: interview.scheduledAt,
      outcome: interview.outcome,
    });

    let updatedApplication = null;
    if (["SAVED", "APPLIED"].includes(application.status)) {
      const updated = await tx.application.update({
        where: { id: application.id },
        data: { status: "INTERVIEWING" },
        include: { company: { select: { name: true } } },
      });

      await logActivity(tx, userId, application.id, "STATUS_CHANGED", `Status changed from ${application.status} to INTERVIEWING`, {
        from: application.status,
        to: "INTERVIEWING",
        reason: "Interview scheduled",
        interviewId: interview.id,
      });

      updatedApplication = withCompany(updated);
    }

    const createdTasks = [];
    const thankYouTask = await maybeCreateInterviewThankYouTask(tx, userId, interview);
    if (thankYouTask) createdTasks.push(thankYouTask);
    await markNotificationDirty(tx, userId);

    return {
      interview: withApplication(interview),
      application: updatedApplication,
      createdTasks,
    };
  });
  if (result?.interview) result.notification = await flushUserNotifications(userId, { prisma, ...notificationOptions });
  return result;
}

export async function updateInterview(userId, id, payload, notificationOptions = {}) {
  const prisma = await getPrismaAsync();

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Interview" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE`;
    const existing = await tx.interview.findFirst({
      where: { id, userId },
      include: INTERVIEW_INCLUDE,
    });
    if (!existing) return null;

    if (payload.applicationId && payload.applicationId !== existing.applicationId) {
      const application = await tx.application.findFirst({
        where: { id: payload.applicationId, userId },
        select: { id: true },
      });
      if (!application) return { missingApplication: true };
    }

    const updated = await tx.interview.update({
      where: { id },
      data: payload,
      include: INTERVIEW_INCLUDE,
    });

    await logActivity(tx, userId, updated.applicationId, "INTERVIEW_UPDATED", `Interview updated for ${updated.application.title}`, {
      interviewId: updated.id,
      previous: pickInterviewSnapshot(existing),
      next: pickInterviewSnapshot(updated),
    });

    await syncInterviewThankYouTask(tx, userId, existing, updated);
    await markNotificationDirty(tx, userId);
    return { interview: withApplication(updated) };
  });
  if (result?.interview) result.notification = await flushUserNotifications(userId, { prisma, ...notificationOptions });
  return result;
}

export async function deleteInterview(userId, id, notificationOptions = {}) {
  const prisma = await getPrismaAsync();
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Interview" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE`;
    const existing = await tx.interview.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) return false;

    await removePendingInterviewTasks(tx, userId, id);
    await cancelNotificationOperations(tx, userId, { kind: "INTERVIEW_REMINDER", resourceId: id });
    await markNotificationDirty(tx, userId);
    await tx.interview.delete({ where: { id } });
    return true;
  });
  if (result) await flushUserNotifications(userId, { prisma, ...notificationOptions });
  return result;
}
