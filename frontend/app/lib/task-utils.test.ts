import { describe, expect, it } from "vitest";
import type { Task } from "./types";
import { formatTaskDueDate, getTaskDueState, toTaskDueDateInput, toTaskDueDatePayload } from "./task-utils";

const task = (dueDate: string | null, completedAt: string | null = null) => ({ dueDate, completedAt } as Task);

describe("task calendar days", () => {
    it.each([
        ["America/Los_Angeles", "2026-03-08T20:00:00Z", "2026-03-08T08:00:00Z"],
        ["America/Los_Angeles", "2026-11-01T20:00:00Z", "2026-11-01T07:00:00Z"],
        ["Asia/Kathmandu", "2026-09-18T20:00:00Z", "2026-09-18T18:15:00Z"],
        ["Pacific/Kiritimati", "2026-09-18T12:00:00Z", "2026-09-18T10:00:00Z"],
        ["UTC", "2026-09-18T12:00:00Z", "2026-09-18T00:00:00Z"],
    ])("uses the configured midnight in %s at %s", (zone, current, midnight) => {
        const now = new Date(current);
        expect(getTaskDueState(task(new Date(+new Date(midnight) - 1).toISOString()), zone, now)).toBe("overdue");
        expect(getTaskDueState(task(midnight), zone, now)).toBe("today");
        expect(getTaskDueState(task(null), zone, now)).toBe("unscheduled");
        expect(getTaskDueState(task("invalid"), zone, now)).toBe("unscheduled");
        expect(getTaskDueState(task(midnight, current), zone, now)).toBe("completed");
        expect(getTaskDueState(task("2027-01-01T12:00:00Z"), zone, now)).toBe("upcoming");
    });

    it.each(["America/Los_Angeles", "Pacific/Kiritimati", "Pacific/Pago_Pago", "Asia/Kathmandu", "UTC"])(
        "preserves selected dates in %s across DST and extreme offsets", (zone) => {
            for (const date of ["2026-03-08", "2026-11-01", "2026-12-31"]) {
                const payload = toTaskDueDatePayload(date, zone);
                expect(payload).not.toBeNull();
                expect(toTaskDueDateInput(payload, zone)).toBe(date);
                expect(getTaskDueState(task(payload), zone, new Date(payload!))).toBe("today");
            }
        },
    );

    it("formats and edits the configured day rather than the UTC day", () => {
        const value = "2026-09-19T01:00:00Z";
        expect(toTaskDueDateInput(value, "America/Los_Angeles")).toBe("2026-09-18");
        expect(formatTaskDueDate(value, "America/Los_Angeles")).toContain("18");
        expect(toTaskDueDatePayload("2026-02-30")).toBeNull();
        expect(toTaskDueDatePayload("")).toBeNull();
        expect(toTaskDueDatePayload("invalid")).toBeNull();
        expect(toTaskDueDateInput(null)).toBe("");
    });
});
