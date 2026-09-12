import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EMPTY_APPLICATION_FORM } from "../lib/constants";
import type { Application, ResumeVersion } from "../lib/types";
import { ApplicationDrawer } from "./ApplicationDrawer";
import { ApplicationsView, NO_RESUME_FILTER } from "./ApplicationsView";

const activeResume = createResume("resume-active", "Product resume");
const archivedResume = createResume("resume-archived", "2025 resume", {
    archivedAt: "2026-08-01T12:00:00.000Z",
});
const otherArchivedResume = createResume("resume-other-archived", "Old resume", {
    archivedAt: "2026-07-01T12:00:00.000Z",
});

const applications: Application[] = [
    {
        id: "application-with-resume",
        title: "Product Engineer",
        status: "APPLIED",
        source: "LinkedIn",
        companyName: "Example Labs",
        createdAt: "2026-09-09T12:00:00.000Z",
        sourceUrl: null,
        location: "Remote",
        salaryMin: null,
        salaryMax: null,
        description: null,
        notes: null,
        dateApplied: "2026-09-09T00:00:00.000Z",
        resumeVersionId: activeResume.id,
        resumeVersion: {
            id: activeResume.id,
            name: activeResume.name,
            targetRole: activeResume.targetRole,
            originalFilename: activeResume.originalFilename,
            uploadStatus: activeResume.uploadStatus,
            archivedAt: activeResume.archivedAt,
        },
    },
    {
        id: "application-without-resume",
        title: "Platform Engineer",
        status: "SAVED",
        source: "Referral",
        companyName: "Northstar",
        createdAt: "2026-09-08T12:00:00.000Z",
        sourceUrl: null,
        location: "Seattle, WA",
        salaryMin: null,
        salaryMax: null,
        description: null,
        notes: null,
        dateApplied: null,
        resumeVersionId: null,
        resumeVersion: null,
    },
];

function createResume(
    id: string,
    name: string,
    overrides: Partial<ResumeVersion> = {},
): ResumeVersion {
    return {
        applicationCount: 0,
        archivedAt: null,
        checksum: "a".repeat(64),
        createdAt: "2026-09-09T12:00:00.000Z",
        id,
        mimeType: "application/pdf",
        name,
        notes: null,
        originalFilename: `${id}.pdf`,
        sizeBytes: 1024,
        targetRole: "Product Engineer",
        updatedAt: "2026-09-09T12:00:00.000Z",
        uploadStatus: "READY",
        ...overrides,
    };
}

function renderApplicationsView() {
    const onDownloadResume = vi.fn();
    render(
        <ApplicationsView
            applications={applications}
            interviews={[]}
            resumes={[activeResume, archivedResume]}
            tasks={[]}
            onCompleteTask={vi.fn()}
            onCreateApplication={vi.fn()}
            onCreateInterview={vi.fn()}
            onCreateTask={vi.fn()}
            onDownloadResume={onDownloadResume}
            onRemoveApplication={vi.fn()}
            onRemoveInterview={vi.fn()}
            onStartEdit={vi.fn()}
            onStartEditInterview={vi.fn()}
            onStatusChange={vi.fn()}
            onUpdateNotes={vi.fn().mockResolvedValue(undefined)}
            onViewInterview={vi.fn()}
        />,
    );
    return { onDownloadResume };
}

describe("application resume experience", () => {
    it("shows and downloads the selected resume, then filters to applications with no resume", async () => {
        const { onDownloadResume } = renderApplicationsView();

        expect(screen.queryByRole("button", { name: "Download PDF" })).toBeNull();
        await userEvent.click(screen.getByRole("button", { name: /Product EngineerExample Labs/ }));
        expect(screen.getByText("resume-active.pdf · Product Engineer")).toBeTruthy();
        await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
        expect(onDownloadResume).toHaveBeenCalledWith(
            applications[0].resumeVersion,
        );

        await userEvent.selectOptions(
            screen.getByLabelText("Filter by resume"),
            NO_RESUME_FILTER,
        );
        const applicationList = screen.getByRole("list");
        expect(
            within(applicationList).getAllByText("Platform Engineer").length,
        ).toBeGreaterThan(0);
        expect(within(applicationList).queryByText("Product Engineer")).toBeNull();
        await userEvent.click(screen.getByRole("button", { name: /Platform EngineerNorthstar/ }));
        expect(screen.getByText("No resume attached")).toBeTruthy();
    });
});
