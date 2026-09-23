import assert from "node:assert/strict";
import test from "node:test";
import { buildTaskWhere, listTasks, taskDayStart } from "../services/tasks.services.js";
import { DEFAULT_NOTIFICATION_PREFERENCES, eligibleKind } from "../services/notification-policy.js";
import { setPrismaForTests } from "../db/prisma.js";

const cases = [
  ["America/Los_Angeles", "2026-03-08T20:00:00Z", "2026-03-08T08:00:00Z"],
  ["America/Los_Angeles", "2026-11-01T20:00:00Z", "2026-11-01T07:00:00Z"],
  ["Asia/Kathmandu", "2026-09-18T20:00:00Z", "2026-09-18T18:15:00Z"],
  ["Pacific/Kiritimati", "2026-09-18T12:00:00Z", "2026-09-18T10:00:00Z"],
  ["UTC", "2026-09-18T12:00:00Z", "2026-09-18T00:00:00Z"],
];
for (const [timeZone, current, midnight] of cases) {
  test(`API and reminders agree at midnight in ${timeZone} on ${current}`, () => {
    const now = new Date(current);
    assert.equal(taskDayStart(now, timeZone).toISOString(), new Date(midnight).toISOString());
    const overdue = buildTaskWhere("user", { overdue: "true" }, timeZone, now);
    const upcoming = buildTaskWhere("user", { upcoming: "true" }, timeZone, now);
    assert.equal(+overdue.dueDate.lt, +upcoming.dueDate.gte);
    assert.equal(overdue.completedAt, null);
    assert.equal(upcoming.completedAt, null);
    for (const delta of [-1, 0, 1, 3600000]) {
      const dueDate = new Date(+new Date(midnight) + delta);
      const task = { dueDate, completedAt: null };
      const kind = eligibleKind(task, { ...DEFAULT_NOTIFICATION_PREFERENCES, timeZone }, now);
      assert.equal(dueDate < overdue.dueDate.lt, kind === "OVERDUE_TASK");
      assert.equal(dueDate >= upcoming.dueDate.gte, kind === "UPCOMING_TASK");
    }
    assert.equal(eligibleKind({ dueDate: null }, DEFAULT_NOTIFICATION_PREFERENCES, now), null);
    assert.equal(eligibleKind({ dueDate: midnight, completedAt: now }, DEFAULT_NOTIFICATION_PREFERENCES, now), null);
  });
}

test("listTasks loads the saved timezone and defaults missing preferences to UTC", async () => {
  let saved = { timeZone: "Pacific/Kiritimati" };
  let where;
  setPrismaForTests({
    notificationPreference: { findUnique: async (args) => {
      assert.deepEqual(args, { where: { userId: "user" } });
      return saved;
    } },
    task: { findMany: async (args) => { where = args.where; return []; } },
  });
  try {
    for (const zone of ["Pacific/Kiritimati", "UTC"]) {
      saved = zone === "UTC" ? null : { timeZone: zone };
      const before = taskDayStart(new Date(), zone);
      await listTasks("user", { overdue: "true" });
      const after = taskDayStart(new Date(), zone);
      assert.ok(+where.dueDate.lt === +before || +where.dueDate.lt === +after);
    }
  } finally { setPrismaForTests(null); }
});

