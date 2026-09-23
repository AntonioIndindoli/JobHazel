import assert from "node:assert/strict";
import test from "node:test";
import { setPrismaForTests } from "../db/prisma.js";
import { updateInterview, deleteInterview } from "../services/interviews.services.js";

import {
  maybeCreateAppliedFollowUpTask,
  maybeCreateInterviewThankYouTask,
  syncInterviewThankYouTask,
  removePendingInterviewTasks,
} from "../services/tasks.services.js";

function buildTransaction(userPreferences) {
  const createdTasks = [];

  return {
    createdTasks,
    user: {
      findUnique: async () => userPreferences,
    },
    task: {
      createMany: async ({ data: [data], skipDuplicates }) => {
        assert.equal(skipDuplicates, true);
        if (createdTasks.some((task) => (data.sourceInterviewId && task.sourceInterviewId === data.sourceInterviewId)
          || (data.sourceApplicationId && task.sourceApplicationId === data.sourceApplicationId))) return { count: 0 };
        const task = { id: `task-${createdTasks.length + 1}`, completedAt: null, ...data, application: null };
        createdTasks.push(task);
        return { count: 1 };
      },
      findUnique: async ({ where }) => createdTasks.find((task) => Object.entries(where).every(([key, value]) => task[key] === value)),
      findFirst: async ({ where }) => createdTasks.find((task) => Object.entries(where).every(([key, value]) => task[key] === value)),
      updateMany: async ({ where, data }) => {
        for (const task of createdTasks) if (Object.entries(where).every(([key, value]) => task[key] === value)) Object.assign(task, data);
      },
      deleteMany: async ({ where }) => {
        for (let i = createdTasks.length - 1; i >= 0; i--) {
          if (Object.entries(where).every(([key, value]) => createdTasks[i][key] === value)) createdTasks.splice(i, 1);
        }
      },
    },
    activityLog: {
      create: async () => ({}),
    },
  };
}

test("follow-up automation uses the configured delay", async () => {
  const tx = buildTransaction({
    autoCreateFollowUpTasks: true,
    followUpTaskDelayDays: 12,
  });

  await maybeCreateAppliedFollowUpTask(tx, "user-1", {
    id: "application-1",
    title: "Product Designer",
    dateApplied: new Date("2026-08-01T10:00:00.000Z"),
  });

  assert.equal(tx.createdTasks.length, 1);
  assert.equal(tx.createdTasks[0].dueDate.toISOString(), "2026-08-13T10:00:00.000Z");
});

test("thank-you automation supports a same-day delay", async () => {
  const tx = buildTransaction({
    autoCreateThankYouTasks: true,
    thankYouTaskDelayDays: 0,
  });

  await maybeCreateInterviewThankYouTask(tx, "user-1", {
    id: "interview-1",
    applicationId: "application-1",
    scheduledAt: new Date("2026-08-20T16:30:00.000Z"),
    interviewerName: "Jordan",
  });

  assert.equal(tx.createdTasks.length, 1);
  assert.equal(tx.createdTasks[0].dueDate.toISOString(), "2026-08-20T16:30:00.000Z");
});

const interview = {
  id: "interview-1", applicationId: "application-1", outcome: "SCHEDULED",
  scheduledAt: new Date("2026-08-20T16:30:00Z"), interviewerName: "Jordan",
};
const preferences = { autoCreateThankYouTasks: true, thankYouTaskDelayDays: 1,
  autoCreateFollowUpTasks: true, followUpTaskDelayDays: 7 };

test("repeated Applied events do not duplicate pending or completed follow-ups", async () => {
  const tx = buildTransaction(preferences);
  const application = { id: "application-1", title: "Designer", dateApplied: new Date() };
  await maybeCreateAppliedFollowUpTask(tx, "user-1", application);
  assert.equal(await maybeCreateAppliedFollowUpTask(tx, "user-1", application), null);
  tx.createdTasks[0].completedAt = new Date();
  assert.equal(await maybeCreateAppliedFollowUpTask(tx, "user-1", application), null);
  assert.equal(tx.createdTasks.length, 1);
  assert.equal(tx.createdTasks[0].sourceApplicationId, application.id);
});

test("thank-you tasks are unique per interview, not per application", async () => {
  const tx = buildTransaction(preferences);
  await maybeCreateInterviewThankYouTask(tx, "user-1", interview);
  assert.equal(await maybeCreateInterviewThankYouTask(tx, "user-1", interview), null);
  await maybeCreateInterviewThankYouTask(tx, "user-1", { ...interview, id: "interview-2" });
  assert.equal(tx.createdTasks.length, 2);
});

test("reschedule preserves delay and synchronizes interviewer and application even with automation disabled", async () => {
  const prefs = { ...preferences };
  const tx = buildTransaction(prefs);
  await maybeCreateInterviewThankYouTask(tx, "user-1", interview);
  prefs.autoCreateThankYouTasks = false;
  await syncInterviewThankYouTask(tx, "user-1", interview, {
    ...interview, applicationId: "application-2", interviewerName: "Alex",
    scheduledAt: new Date("2026-08-25T18:00:00Z"),
  });
  assert.equal(tx.createdTasks[0].dueDate.toISOString(), "2026-08-26T18:00:00.000Z");
  assert.equal(tx.createdTasks[0].title, "Send thank-you note to Alex");
  assert.equal(tx.createdTasks[0].applicationId, "application-2");
});

test("cancellation removes only pending source tasks and restoration creates one replacement", async () => {
  const tx = buildTransaction(preferences);
  await maybeCreateInterviewThankYouTask(tx, "user-1", interview);
  tx.createdTasks.push({ id: "manual", userId: "user-1", type: "THANK_YOU", completedAt: null });
  const canceled = { ...interview, outcome: "CANCELED" };
  await syncInterviewThankYouTask(tx, "user-1", interview, canceled);
  assert.deepEqual(tx.createdTasks.map((task) => task.id), ["manual"]);
  assert.equal(await maybeCreateInterviewThankYouTask(tx, "user-1", canceled), null);
  await syncInterviewThankYouTask(tx, "user-1", canceled, interview);
  await syncInterviewThankYouTask(tx, "user-1", canceled, interview);
  assert.equal(tx.createdTasks.length, 2);
});

test("completed tasks and other users' tasks survive source changes", async () => {
  const tx = buildTransaction(preferences);
  await maybeCreateInterviewThankYouTask(tx, "user-1", interview);
  const task = tx.createdTasks[0];
  task.completedAt = new Date();
  const before = { ...task };
  await syncInterviewThankYouTask(tx, "user-1", interview, { ...interview, scheduledAt: new Date() });
  await removePendingInterviewTasks(tx, "user-1", interview.id);
  assert.deepEqual(task, before);
  task.completedAt = null;
  await removePendingInterviewTasks(tx, "other-user", interview.id);
  assert.equal(tx.createdTasks.length, 1);
});

test("interview service updates and deletes synchronize tasks in the source transaction", async () => {
  const tx = buildTransaction(preferences);
  let current = { ...interview, application: { title: "Designer" } };
  tx.$queryRaw = async () => [];
  tx.interview = {
    findFirst: async () => current,
    update: async ({ data }) => (current = { ...current, ...data }),
    delete: async () => {
      assert.equal(tx.createdTasks.length, 0);
      current = null;
    },
  };
  setPrismaForTests({ $transaction: async (callback) => callback(tx) });
  try {
    await maybeCreateInterviewThankYouTask(tx, "user-1", interview);
    await updateInterview("user-1", interview.id, { scheduledAt: new Date("2026-08-22T16:30:00Z") });
    assert.equal(tx.createdTasks[0].dueDate.toISOString(), "2026-08-23T16:30:00.000Z");
    assert.equal(await deleteInterview("user-1", interview.id), true);
    assert.equal(await deleteInterview("user-1", interview.id), false);
  } finally {
    setPrismaForTests(null);
  }
});
