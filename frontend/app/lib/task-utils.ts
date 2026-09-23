import { TASK_TYPE_LABELS } from "./constants";
import type { Task, TaskType } from "./types";

export type TaskDueState =
    | "completed"
    | "overdue"
    | "today"
    | "upcoming"
    | "unscheduled";

export function isTaskType(type: string): type is TaskType {
    return Object.prototype.hasOwnProperty.call(TASK_TYPE_LABELS, type);
}

export function getTaskTypeLabel(type: string) {
    return isTaskType(type) ? TASK_TYPE_LABELS[type] : type;
}

function getValidDate(value: string | null) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function taskCalendarDay(date: Date, timeZone = "UTC") {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en", {
        timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(date).map(({ type, value }) => [type, value]));
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86400000;
}

export function getTaskTimestamp(task: Task) {
    const date = getValidDate(task.dueDate) ?? getValidDate(task.createdAt);
    return date?.getTime() ?? 0;
}

export function getTaskDueState(task: Task, timeZone = "UTC", now = new Date()): TaskDueState {
    if (task.completedAt) return "completed";

    const dueDate = getValidDate(task.dueDate);
    if (!dueDate) return "unscheduled";

    const dueDay = taskCalendarDay(dueDate, timeZone);
    const today = taskCalendarDay(now, timeZone);

    if (dueDay < today) return "overdue";
    if (dueDay === today) return "today";
    return "upcoming";
}

export function isOpenTask(task: Task) {
    return !task.completedAt;
}

export function isTaskNeedingAttention(task: Task, timeZone = "UTC") {
    const state = getTaskDueState(task, timeZone);
    return state === "overdue" || state === "today";
}

export function formatTaskDueDate(value: string | null, timeZone = "UTC") {
    const date = getValidDate(value);
    if (!date) return "No due date";

    return new Intl.DateTimeFormat(undefined, {
        timeZone,
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(date);
}

export function toTaskDueDateInput(value: string | null, timeZone = "UTC") {
    const date = getValidDate(value);
    if (!date) return "";
    return new Date(taskCalendarDay(date, timeZone) * 86400000).toISOString().slice(0, 10);
}

export function toTaskDueDatePayload(value: string, timeZone = "UTC") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const target = new Date(`${value}T12:00:00Z`);
    if (Number.isNaN(+target) || target.toISOString().slice(0, 10) !== value) return null;
    // Resolve noon in the configured zone, independent of the device timezone.
    let instant = +target;
    for (let i = 0; i < 4; i++) {
        const parts = Object.fromEntries(new Intl.DateTimeFormat("en", {
            timeZone, year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
        }).formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
        const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
        if (local === +target) return new Date(instant).toISOString();
        instant += +target - local;
    }
    return null;
}

export function sortTasksByDueDate(tasks: Task[]) {
    return [...tasks].sort((left, right) => {
        const leftCompleted = Boolean(left.completedAt);
        const rightCompleted = Boolean(right.completedAt);
        if (leftCompleted !== rightCompleted) return leftCompleted ? 1 : -1;

        const leftDue = getValidDate(left.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightDue =
            getValidDate(right.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        if (leftDue !== rightDue) return leftDue - rightDue;

        return getTaskTimestamp(right) - getTaskTimestamp(left);
    });
}
