import { describe, expect, it } from "vitest";
import { buildSourceQualityRows } from "./application-analytics";
import type { ActivityLog, Application } from "./types";

const application: Application = {
    id: "a", title: "Engineer", status: "APPLIED", source: "LinkedIn", companyName: "Example",
    createdAt: "2026-09-01T12:00:00Z", dateApplied: "2026-09-01T12:00:00Z",
    sourceUrl: null, location: null, salaryMin: null, salaryMax: null,
    description: null, notes: null, resumeVersionId: null, resumeVersion: null,
};
const event = (type: string, metadata: unknown, createdAt = "2026-09-04T12:00:00Z"): ActivityLog => ({
    id: "event", applicationId: "a", type, metadata, createdAt, message: "",
});
function row(status: string, history: ActivityLog[] = [], overrides: Partial<Application> = {}) {
    return buildSourceQualityRows([{ ...application, status, ...overrides }], { a: history }, [])[0];
}

describe("employer response analytics", () => {
    it("does not count withdrawal without an employer response", () => {
        expect(row("WITHDRAWN", [event("STATUS_CHANGED", { from: "APPLIED", to: "WITHDRAWN" })])).toMatchObject({ responses: 0, responseRate: 0, averageDaysToResponse: null });
    });
    it("retains a recorded rejection or interview before withdrawal", () => {
        for (const status of ["REJECTED", "INTERVIEWING"]) {
            expect(row("WITHDRAWN", [event("STATUS_CHANGED", { from: "APPLIED", to: status }), event("STATUS_CHANGED", { from: status, to: "WITHDRAWN" }, "2026-09-08T12:00:00Z")])).toMatchObject({ responses: 1, responseRate: 100, averageDaysToResponse: 3 });
        }
    });
    it("counts an interview recorded without a pipeline change", () => {
        expect(row("APPLIED", [event("INTERVIEW_ADDED", {})])).toMatchObject({ responses: 1, averageDaysToResponse: 3 });
    });
    it("does not fabricate timing from current status or imported creation time", () => {
        expect(row("OFFER").averageDaysToResponse).toBeNull();
        expect(row("REJECTED", [event("APPLICATION_CREATED", { status: "REJECTED" })])).toMatchObject({ responses: 1, averageDaysToResponse: null });
    });
    it("excludes unknown application dates and invalid or pre-application response dates", () => {
        expect(row("INTERVIEWING", [event("INTERVIEW_ADDED", {})], { dateApplied: null }).averageDaysToResponse).toBeNull();
        expect(row("REJECTED", [event("STATUS_CHANGED", { to: "REJECTED" }, "invalid"), event("INTERVIEW_ADDED", {}, "2026-08-01T00:00:00Z")]).averageDaysToResponse).toBeNull();
    });
    it("allows a real same-day response and chooses the earliest recorded response", () => {
        expect(row("OFFER", [event("STATUS_CHANGED", { to: "OFFER" }), event("INTERVIEW_ADDED", {}, application.dateApplied!) ]).averageDaysToResponse).toBe(0);
    });
    it("averages only known durations while retaining all responses in the rate", () => {
        const rows = buildSourceQualityRows([{ ...application, status: "REJECTED" }, { ...application, id: "b", status: "OFFER" }], { a: [event("STATUS_CHANGED", { to: "REJECTED" })] }, []);
        expect(rows[0]).toMatchObject({ responses: 2, responseRate: 100, averageDaysToResponse: 3 });
    });
});
