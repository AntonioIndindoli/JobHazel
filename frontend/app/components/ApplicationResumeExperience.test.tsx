import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Application, ResumeVersion } from "../lib/types";
import { ApplicationsView, NO_RESUME_FILTER } from "./ApplicationsView";

const activeResume = createResume("resume-active", "Product resume");
const archivedResume = createResume("resume-archived", "2025 resume", {
    archivedAt: "2026-08-01T12:00:00.000Z",
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
    const onChangeResume = vi.fn().mockResolvedValue(undefined);
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
            onChangeResume={onChangeResume}
            onRemoveApplication={vi.fn()}
            onRemoveInterview={vi.fn()}
            onStartEdit={vi.fn()}
            onStartEditInterview={vi.fn()}
            onStatusChange={vi.fn()}
            onUpdateNotes={vi.fn().mockResolvedValue(undefined)}
            onViewInterview={vi.fn()}
        />,
    );
    return { onDownloadResume, onChangeResume };
}

describe("application resume experience", () => {
    it("filters from the quick views and clears the needs-action filter", async () => {
        renderApplicationsView();
        const views = screen.getByRole("navigation", { name: "applications views" });
        await userEvent.click(within(views).getByRole("button", { name: /Applied/ }));
        expect(within(screen.getByRole("list")).queryByText("Platform Engineer")).toBeNull();
        await userEvent.click(within(views).getByRole("button", { name: /Needs action/ }));
        expect(screen.getByText("No applications match these filters")).toBeTruthy();
        await userEvent.click(screen.getByRole("button", { name: "Remove Tasks filter: Needs action" }));
        expect(within(screen.getByRole("list")).getByText("Platform Engineer")).toBeTruthy();
    });

    it("shows and downloads the selected resume, then filters to applications with no resume", async () => {
        const { onDownloadResume } = renderApplicationsView();

        expect(screen.queryByRole("button", { name: "Download PDF" })).toBeNull();
        await userEvent.click(screen.getByRole("button", { name: /Product EngineerExample Labs/ }));
        expect(screen.getByText("resume-active.pdf · Product Engineer")).toBeTruthy();
        await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
        expect(onDownloadResume).toHaveBeenCalledWith(
            applications[0].resumeVersion,
        );

        await userEvent.click(screen.getByRole("button", { name: "Filters" }));
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
        expect(screen.getByText("No resume yet")).toBeTruthy();
    });

    it("changes the resume directly from the detail panel", async () => {
        const replacementResume = createResume("resume-replacement", "Engineering resume");
        const onChangeResume = vi.fn().mockResolvedValue(undefined);
        const onStartEdit = vi.fn();
        render(
            <ApplicationsView
                applications={applications}
                interviews={[]}
                resumes={[activeResume, replacementResume, archivedResume]}
                tasks={[]}
                onChangeResume={onChangeResume}
                onCompleteTask={vi.fn()}
                onCreateApplication={vi.fn()}
                onCreateInterview={vi.fn()}
                onCreateTask={vi.fn()}
                onDownloadResume={vi.fn()}
                onRemoveApplication={vi.fn()}
                onRemoveInterview={vi.fn()}
                onStartEdit={onStartEdit}
                onStartEditInterview={vi.fn()}
                onStatusChange={vi.fn()}
                onUpdateNotes={vi.fn().mockResolvedValue(undefined)}
                onViewInterview={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: /Product EngineerExample Labs/ }));
        await userEvent.click(screen.getByRole("button", { name: "Change resume" }));
        const menu = screen.getByRole("menu", { name: "Select a resume" });
        expect(within(menu).getAllByRole("menuitem")[0].textContent).toContain("Remove resume");
        expect(within(menu).queryByText("Product resume · Product Engineer")).toBeNull();
        expect(within(menu).queryByText("2025 resume · Product Engineer")).toBeNull();
        await userEvent.click(within(menu).getByRole("menuitem", { name: "Engineering resume · Product Engineer" }));
        expect(onChangeResume).toHaveBeenCalledWith("application-with-resume", "resume-replacement");
        expect(onStartEdit).not.toHaveBeenCalled();
    });

    it("removes the attached resume from the first menu option", async () => {
        const { onChangeResume } = renderApplicationsView();
        await userEvent.click(screen.getByRole("button", { name: /Product EngineerExample Labs/ }));
        await userEvent.click(screen.getByRole("button", { name: "Change resume" }));
        const menu = screen.getByRole("menu", { name: "Select a resume" });
        await userEvent.click(within(menu).getAllByRole("menuitem")[0]);
        expect(onChangeResume).toHaveBeenCalledWith("application-with-resume", null);
    });
});
