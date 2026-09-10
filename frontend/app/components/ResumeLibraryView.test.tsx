import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ResumeVersion } from "../lib/types";
import { ResumeLibraryView } from "./ResumeLibraryView";

const resume: ResumeVersion = {
    applicationCount: 2,
    archivedAt: null,
    checksum: "a".repeat(64),
    createdAt: "2026-09-09T12:00:00.000Z",
    id: "resume-1",
    mimeType: "application/pdf",
    name: "Product manager — core",
    notes: "Highlights platform and growth work.",
    originalFilename: "product-manager.pdf",
    sizeBytes: 245760,
    targetRole: "Senior Product Manager",
    updatedAt: "2026-09-09T12:00:00.000Z",
    uploadStatus: "READY",
};

function renderLibrary(overrides: Partial<Parameters<typeof ResumeLibraryView>[0]> = {}) {
    const props: Parameters<typeof ResumeLibraryView>[0] = {
        busyResumeId: null,
        error: "",
        isLoading: false,
        onArchiveChange: vi.fn().mockResolvedValue(undefined),
        onDelete: vi.fn().mockResolvedValue(undefined),
        onDownload: vi.fn().mockResolvedValue(undefined),
        onMetadataUpdate: vi.fn().mockResolvedValue(undefined),
        onRetry: vi.fn(),
        onUploadOpen: vi.fn(),
        resumes: [resume],
        ...overrides,
    };
    render(<ResumeLibraryView {...props} />);
    return props;
}

describe("ResumeLibraryView", () => {
    it("renders loading, error, and empty states with actions", async () => {
        const { rerender } = render(
            <ResumeLibraryView
                {...renderLibraryProps()}
                isLoading
                resumes={[]}
            />,
        );
        expect(screen.getByLabelText("Loading resumes")).toBeTruthy();

        const onRetry = vi.fn();
        rerender(
            <ResumeLibraryView
                {...renderLibraryProps()}
                error="The server is unavailable."
                isLoading={false}
                onRetry={onRetry}
                resumes={[]}
            />,
        );
        await userEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(onRetry).toHaveBeenCalledOnce();

        const onUploadOpen = vi.fn();
        rerender(
            <ResumeLibraryView
                {...renderLibraryProps()}
                isLoading={false}
                onUploadOpen={onUploadOpen}
                resumes={[]}
            />,
        );
        await userEvent.click(screen.getByRole("button", { name: "Upload first resume" }));
        expect(onUploadOpen).toHaveBeenCalledOnce();
    });

    it("shows resume metadata and supports archive and keyboard menu access", async () => {
        const onArchiveChange = vi.fn().mockResolvedValue(undefined);
        renderLibrary({ onArchiveChange });

        expect(screen.getByText("Product manager — core")).toBeTruthy();
        expect(screen.getByText("Senior Product Manager")).toBeTruthy();
        expect(screen.getByText("product-manager.pdf")).toBeTruthy();
        expect(screen.getByText("240 KB")).toBeTruthy();
        expect(screen.getByText("2 applications")).toBeTruthy();

        const menuButton = screen.getByRole("button", {
            name: "More actions for Product manager — core",
        });
        await userEvent.click(menuButton);
        const downloadItem = screen.getByRole("menuitem", { name: "Download PDF" });
        expect(document.activeElement).toBe(downloadItem);
        fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
        expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Edit details" }));
        fireEvent.keyDown(screen.getByRole("menu"), { key: "End" });
        await userEvent.click(screen.getByRole("menuitem", { name: "Archive version" }));
        expect(onArchiveChange).toHaveBeenCalledWith(resume, true);
    });

    it("edits display name, target role, and notes", async () => {
        const onMetadataUpdate = vi.fn().mockResolvedValue(undefined);
        renderLibrary({ onMetadataUpdate });

        await userEvent.click(screen.getByRole("button", { name: "Edit details" }));
        const nameInput = screen.getByLabelText("Display name");
        expect(document.activeElement).toBe(nameInput);
        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, "Growth resume");
        await userEvent.clear(screen.getByLabelText(/Target role/));
        await userEvent.type(screen.getByLabelText(/Target role/), "Growth PM");
        await userEvent.clear(screen.getByLabelText(/Notes/));
        await userEvent.type(screen.getByLabelText(/Notes/), "Growth experiments");
        await userEvent.click(screen.getByRole("button", { name: "Save details" }));

        await waitFor(() =>
            expect(onMetadataUpdate).toHaveBeenCalledWith(resume, {
                name: "Growth resume",
                notes: "Growth experiments",
                targetRole: "Growth PM",
            }),
        );
    });

    it("explains archive versus deletion and confirms an unreferenced permanent delete", async () => {
        const onDelete = vi.fn().mockResolvedValue(undefined);
        renderLibrary({
            onDelete,
            resumes: [{ ...resume, applicationCount: 0 }],
        });

        await userEvent.click(
            screen.getByRole("button", { name: "More actions for Product manager — core" }),
        );
        await userEvent.click(
            screen.getByRole("menuitem", { name: "Permanently delete" }),
        );
        expect(screen.getByText(/Archiving hides a version from new selections/i)).toBeTruthy();
        await userEvent.click(
            screen.getByRole("button", { name: "Delete permanently" }),
        );
        await waitFor(() => expect(onDelete).toHaveBeenCalledOnce());
    });

    it("blocks permanent deletion while a resume is referenced", async () => {
        renderLibrary();
        await userEvent.click(
            screen.getByRole("button", { name: "More actions for Product manager — core" }),
        );
        await userEvent.click(
            screen.getByRole("menuitem", { name: "Permanently delete" }),
        );

        expect(screen.getByText(/used in 2 applications/i)).toBeTruthy();
        expect(
            (screen.getByRole("button", { name: "Delete permanently" }) as HTMLButtonElement)
                .disabled,
        ).toBe(true);
    });
});

function renderLibraryProps(): Parameters<typeof ResumeLibraryView>[0] {
    return {
        busyResumeId: null,
        error: "",
        isLoading: false,
        onArchiveChange: vi.fn().mockResolvedValue(undefined),
        onDelete: vi.fn().mockResolvedValue(undefined),
        onDownload: vi.fn().mockResolvedValue(undefined),
        onMetadataUpdate: vi.fn().mockResolvedValue(undefined),
        onRetry: vi.fn(),
        onUploadOpen: vi.fn(),
        resumes: [],
    };
}
