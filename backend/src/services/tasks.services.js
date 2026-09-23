import { getPrismaAsync } from "../db/prisma.js";

import { localDay, publicPreferences } from "./notification-policy.js";

// Locate midnight using calendar days, including DST transitions.
export function taskDayStart(now, timeZone) {
  const day = localDay(now, timeZone);
  let low = now.getTime() - 48 * 3600000;
  let high = now.getTime();
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (localDay(new Date(middle), timeZone) < day) low = middle + 1;
    else high = middle;
  }
  return new Date(low);
}

const TASK_INCLUDE = {
  application: {
    select: {
      id: true,
      title: true,
      company: { select: { name: true } },
    },
  },
};

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function withApplication(task) {
  return {
    ...task,
    applicationTitle: task.application?.title ?? null,
    companyName: task.application?.company?.name ?? null,
  };
}

export function buildTaskWhere(userId, query = {}, timeZone = "UTC", now = new Date()) {
  const where = { userId };
  if (query.applicationId) where.applicationId = String(query.applicationId);
  if (query.type) where.type = String(query.type);
  if (query.completed === "true") where.completedAt = { not: null };
  if (query.completed === "false") where.completedAt = null;

  if (query.overdue === "true") {
    where.completedAt = null;
    where.dueDate = { lt: taskDayStart(now, timeZone) };
  } else if (query.upcoming === "true") {
    where.completedAt = null;
    where.dueDate = { gte: taskDayStart(now, timeZone) };
  } else if (query.startDate || query.endDate) {
    where.dueDate = {};
    if (query.startDate) where.dueDate.gte = new Date(String(query.startDate));
    if (query.endDate) where.dueDate.lte = new Date(String(query.endDate));
  }

  return where;
}

async function logTaskActivity(tx, userId, applicationId, type, message, metadata = null) {
  if (!applicationId) return;
  await tx.activityLog.create({ data: { userId, applicationId, type, message, metadata } });
}

export async function listTasks(userId, query = {}) {
  const prisma = await getPrismaAsync();
  const preferences = publicPreferences(await prisma.notificationPreference.findUnique({ where: { userId } }));
  const tasks = await prisma.task.findMany({
    where: buildTaskWhere(userId, query, preferences.timeZone),
    include: TASK_INCLUDE,
    orderBy: [{ completedAt: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });
  return tasks.map(withApplication);
}

export async function createTask(userId, payload) {
  const prisma = await getPrismaAsync();
  return prisma.$transaction(async (tx) => {
    if (payload.applicationId) {
      const application = await tx.application.findFirst({ where: { id: payload.applicationId, userId }, select: { id: true } });
      if (!application) return null;
    }

    const task = await tx.task.create({ data: { userId, ...payload }, include: TASK_INCLUDE });
    await logTaskActivity(tx, userId, task.applicationId, "TASK_ADDED", `Task added: ${task.title}`, {
      taskId: task.id,
      type: task.type,
      dueDate: task.dueDate,
    });
    return withApplication(task);
  });
}

export async function updateTask(userId, id, payload) {
  const prisma = await getPrismaAsync();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.task.findFirst({ where: { id, userId } });
    if (!existing) return null;

    if (payload.applicationId) {
      const application = await tx.application.findFirst({ where: { id: payload.applicationId, userId }, select: { id: true } });
      if (!application) return { missingApplication: true };
    }

    const updated = await tx.task.update({ where: { id }, data: payload, include: TASK_INCLUDE });
    return withApplication(updated);
  });
}

export async function completeTask(userId, id) {
  const prisma = await getPrismaAsync();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.task.findFirst({ where: { id, userId } });
    if (!existing) return null;

    const completedAt = existing.completedAt ? null : new Date();
    const task = await tx.task.update({ where: { id }, data: { completedAt }, include: TASK_INCLUDE });
    if (!existing.completedAt) {
      await logTaskActivity(tx, userId, task.applicationId, "TASK_COMPLETED", `Task completed: ${task.title}`, { taskId: task.id });
    }
    return withApplication(task);
  });
}

export async function deleteTask(userId, id) {
  const prisma = await getPrismaAsync();
  const existing = await prisma.task.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) return false;
  await prisma.task.delete({ where: { id } });
  return true;
}

export async function getTaskAutomationPreferences(userId) {
  const prisma = await getPrismaAsync();
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      autoCreateFollowUpTasks: true,
      autoCreateThankYouTasks: true,
      followUpTaskDelayDays: true,
      thankYouTaskDelayDays: true,
    },
  });
}

export async function updateTaskAutomationPreferences(userId, payload) {
  const prisma = await getPrismaAsync();
  return prisma.user.update({
    where: { id: userId },
    data: payload,
    select: {
      autoCreateFollowUpTasks: true,
      autoCreateThankYouTasks: true,
      followUpTaskDelayDays: true,
      thankYouTaskDelayDays: true,
    },
  });
}

// skipDuplicates keeps concurrent source events from inserting duplicate tasks
// without raising a unique violation that would abort the source transaction.
async function createAutomatedTask(tx, { data }) {
  const result = await tx.task.createMany({ data: [data], skipDuplicates: true });
  if (!result.count) return null;
  const where = data.sourceInterviewId
    ? { sourceInterviewId: data.sourceInterviewId }
    : { sourceApplicationId: data.sourceApplicationId };
  return tx.task.findUnique({ where, include: TASK_INCLUDE });
}

export async function removePendingInterviewTasks(tx, userId, interviewId) {
  await tx.task.deleteMany({ where: { userId, sourceInterviewId: interviewId, completedAt: null } });
}

export async function syncInterviewThankYouTask(tx, userId, previous, interview) {
  if (interview.outcome === "CANCELED") {
    await removePendingInterviewTasks(tx, userId, interview.id);
    return;
  }
  const task = await tx.task.findFirst({ where: { userId, sourceInterviewId: interview.id } });
  if (!task) {
    if (previous.outcome === "CANCELED") await maybeCreateInterviewThankYouTask(tx, userId, interview);
    return;
  }
  if (task.completedAt) return;
  const data = { applicationId: interview.applicationId };
  if (previous.interviewerName !== interview.interviewerName) {
    data.title = `Send thank-you note${interview.interviewerName ? ` to ${interview.interviewerName}` : ""}`;
  }
  if (task.dueDate && +new Date(previous.scheduledAt) !== +new Date(interview.scheduledAt)) {
    // Preserve the existing delay, including user adjustments.
    data.dueDate = new Date(+new Date(task.dueDate) + +new Date(interview.scheduledAt) - +new Date(previous.scheduledAt));
  }
  await tx.task.updateMany({ where: { id: task.id, userId, completedAt: null }, data });
}

export async function maybeCreateAppliedFollowUpTask(tx, userId, application) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { autoCreateFollowUpTasks: true, followUpTaskDelayDays: true },
  });
  if (!user?.autoCreateFollowUpTasks) return null;

  const dueDate = addDays(application.dateApplied ?? new Date(), user.followUpTaskDelayDays);
  const task = await createAutomatedTask(tx, {
    data: {
      userId,
      applicationId: application.id,
      sourceApplicationId: application.id,
      title: `Follow up on ${application.title}`,
      description: "Check in on the application if you have not received a response.",
      dueDate,
      type: "FOLLOW_UP",
    },
    include: TASK_INCLUDE,
  });
  if (!task) return null;
  await logTaskActivity(tx, userId, application.id, "TASK_ADDED", `Follow-up task added for ${application.title}`, { taskId: task.id });
  return withApplication(task);
}

export async function maybeCreateInterviewThankYouTask(tx, userId, interview) {
  if (interview.outcome === "CANCELED") return null;
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { autoCreateThankYouTasks: true, thankYouTaskDelayDays: true },
  });
  if (!user?.autoCreateThankYouTasks) return null;

  const dueDate = addDays(interview.scheduledAt, user.thankYouTaskDelayDays);
  const titleSuffix = interview.interviewerName ? ` to ${interview.interviewerName}` : "";
  const task = await createAutomatedTask(tx, {
    data: {
      userId,
      applicationId: interview.applicationId,
      sourceInterviewId: interview.id,
      title: `Send thank-you note${titleSuffix}`,
      description: "Send a concise thank-you note after the interview.",
      dueDate,
      type: "THANK_YOU",
    },
    include: TASK_INCLUDE,
  });
  if (!task) return null;
  await logTaskActivity(tx, userId, interview.applicationId, "TASK_ADDED", "Thank-you task added after interview", {
    taskId: task.id,
    interviewId: interview.id,
  });
  return withApplication(task);
}
