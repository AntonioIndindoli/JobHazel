import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ResumeApiError } from "../lib/resume-api";
import type { ResumeUploadInitiation, ResumeVersion } from "../lib/types";
import { ResumeUploadDialog } from "./ResumeUploadDialog";

const pendingResume: ResumeVersion = {
    applicationCount: 0,
    archivedAt: null,
    checksum: "b".repeat(64),
    createdAt: "2026-09-09T12:00:00.000Z",
    id: "resume-pending",
    mimeType: "application/pdf",
    name: "Core resume",
    notes: null,
    originalFilename: "core-resume.pdf",
    sizeBytes: 8,
    targetRole: null,
    updatedAt: "2026-09-09T12:00:00.000Z",
    uploadStatus: "PENDING",
};

const uploadSession: ResumeUploadInitiation = {
    expiresInSeconds: 900,
    objectKey: "users/user-1/resumes/resume-pending/file.pdf",
    requiredHeaders: { "Content-Type": "application/pdf" },
    resume: pendingResume,
    uploadUrl: "https://example.test/upload",
};

const readyResume: ResumeVersion = { ...pendingResume, uploadStatus: "READY" };

function renderUpload(overrides: Partial<Parameters<typeof ResumeUploadDialog>[0]> = {}) {
    const props: Parameters<typeof ResumeUploadDialog>[0] = {
        calculateChecksum: vi.fn().mockResolvedValue("b".repeat(64)),
        isOpen: true,
        onClose: vi.fn(),
        onComplete: vi.fn().mockResolvedValue(readyResume),
        onInitiate: vi.fn().mockResolvedValue(uploadSession),
        onSuccess: vi.fn(),
        uploadFile: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
    render(<ResumeUploadDialog {...props} />);
    return props;
}

async function choosePdf() {
    const file = new File(["%PDF-1.7"], "core-resume.pdf", {
        type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("Choose resume PDF"), {
        target: { files: [file] },
    });
    return file;
}

describe("ResumeUploadDialog", () => {
    it("opens with the file chooser focused", () => {
        renderUpload();
        expect(document.activeElement).toBe(
            screen.getByRole("button", { name: "Choose PDF" }),
        );
    });

    it("rejects invalid files before starting an upload", () => {
        const onInitiate = vi.fn();
        renderUpload({ onInitiate });
        fireEvent.change(screen.getByLabelText("Choose resume PDF"), {
            target: { files: [new File(["text"], "resume.txt", { type: "text/plain" })] },
        });
        expect(screen.getByRole("alert").textContent).toContain("Only PDF files are supported");
        expect(onInitiate).not.toHaveBeenCalled();
    });

    it("uploads and completes a valid PDF", async () => {
        const onInitiate = vi.fn().mockResolvedValue(uploadSession);
        const uploadFile = vi.fn().mockImplementation(async ({ onProgress }) => onProgress(100));
        const onComplete = vi.fn().mockResolvedValue(readyResume);
        const onSuccess = vi.fn();
        const file = await chooseAfterRender({ onComplete, onInitiate, onSuccess, uploadFile });

        await userEvent.click(screen.getByRole("button", { name: "Upload resume" }));
        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(readyResume));
        expect(onInitiate).toHaveBeenCalledWith(expect.objectContaining({
            checksum: "b".repeat(64),
            name: "core resume",
            originalFilename: file.name,
            sizeBytes: file.size,
        }));
        expect(uploadFile).toHaveBeenCalledOnce();
        expect(onComplete).toHaveBeenCalledWith("resume-pending");
    });

    it("keeps a failed direct upload retryable", async () => {
        const uploadFile = vi
            .fn()
            .mockRejectedValueOnce(new Error("Network interrupted"))
            .mockResolvedValueOnce(undefined);
        const onComplete = vi.fn().mockResolvedValue(readyResume);
        const onSuccess = vi.fn();
        await chooseAfterRender({ onComplete, onSuccess, uploadFile });

        await userEvent.click(screen.getByRole("button", { name: "Upload resume" }));
        expect(await screen.findByRole("button", { name: "Retry upload" })).toBeTruthy();
        await userEvent.click(screen.getByRole("button", { name: "Retry upload" }));
        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(readyResume));
        expect(uploadFile).toHaveBeenCalledTimes(2);
        expect(onComplete).toHaveBeenCalledOnce();
    });

    it("retries verification without uploading the PDF twice", async () => {
        const uploadFile = vi.fn().mockResolvedValue(undefined);
        const onComplete = vi
            .fn()
            .mockRejectedValueOnce(
                new ResumeApiError(
                    "Storage unavailable",
                    503,
                    "RESUME_STORAGE_UNAVAILABLE",
                ),
            )
            .mockResolvedValueOnce(readyResume);
        const onSuccess = vi.fn();
        await chooseAfterRender({ onComplete, onSuccess, uploadFile });

        await userEvent.click(screen.getByRole("button", { name: "Upload resume" }));
        expect(await screen.findByRole("button", { name: "Retry verification" })).toBeTruthy();
        await userEvent.click(screen.getByRole("button", { name: "Retry verification" }));
        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(readyResume));
        expect(uploadFile).toHaveBeenCalledOnce();
        expect(onComplete).toHaveBeenCalledTimes(2);
    });
});

async function chooseAfterRender(
    overrides: Partial<Parameters<typeof ResumeUploadDialog>[0]>,
) {
    renderUpload(overrides);
    return choosePdf();
}
