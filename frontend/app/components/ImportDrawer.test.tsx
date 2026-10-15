import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createImportReviewDefaults } from "../lib/constants";
import type { ResumeVersion } from "../lib/types";
import { ImportDrawer } from "./ImportDrawer";

const readyResume: ResumeVersion = {
    id: "resume-ready", name: "Engineering resume", targetRole: "Software Engineer",
    originalFilename: "engineering.pdf", mimeType: "application/pdf", sizeBytes: 100,
    checksum: null, uploadStatus: "READY", archivedAt: null, notes: null,
    applicationCount: 0, createdAt: "2026-10-13", updatedAt: "2026-10-13",
};

function setup(resumes = [readyResume], loading = false, error = "") {
    const onSubmit = vi.fn();
    const onRetry = vi.fn();
    function Review() {
        const [review, setReview] = useState({ ...createImportReviewDefaults(), title: "Software Engineer" });
        return <ImportDrawer
            importCapture={{ sourceUrl: "", pageTitle: "", rawText: "" }}
            importDraft={null} importDuplicates={[]} importErrors={{}}
            importReview={review} importStep="review" isImportSubmitting={false} parserDebug={null}
            resumes={resumes} isResumesLoading={loading} resumesError={error} onResumesRetry={onRetry}
            onCaptureChange={vi.fn()} onClose={vi.fn()} onCreateDraft={vi.fn()}
            onReviewChange={setReview} onReviewSubmit={(event) => { event.preventDefault(); onSubmit(review); }}
            onStepChange={vi.fn()}
        />;
    }
    render(<Review />);
    return { onSubmit, onRetry };
}

describe("import review resume selection", () => {
    it("includes only active completed resumes and preserves the selection when saving", async () => {
        const { onSubmit } = setup([
            readyResume,
            { ...readyResume, id: "pending", name: "Incomplete", uploadStatus: "PENDING" },
            { ...readyResume, id: "archived", name: "Archived", archivedAt: "2025-01-01" },
        ]);
        expect(screen.queryByRole("option", { name: "Incomplete" })).toBeNull();
        expect(screen.queryByRole("option", { name: "Archived" })).toBeNull();
        const picker = screen.getByLabelText("Resume version");
        await userEvent.selectOptions(picker, "resume-ready");
        await userEvent.click(screen.getByRole("button", { name: "Save application" }));
        expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ resumeVersionId: "resume-ready" }));
        await userEvent.selectOptions(picker, "");
        await userEvent.click(screen.getByRole("button", { name: "Save application" }));
        expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ resumeVersionId: "" }));
    });

    it("allows saving without a resume and explains an empty library", async () => {
        const { onSubmit } = setup([]);
        expect(screen.getByText(/Upload a completed PDF in Resumes/)).toBeTruthy();
        await userEvent.click(screen.getByRole("button", { name: "Save application" }));
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ resumeVersionId: "" }));
    });

    it("shows loading and a retry action for library failures", async () => {
        const { onRetry } = setup([], true, "Could not load resumes.");
        expect((screen.getByLabelText("Resume version") as HTMLSelectElement).disabled).toBe(true);
        expect(screen.getByText("Loading resumes…")).toBeTruthy();
        expect(screen.getByRole("alert").textContent).toContain("Could not load resumes.");
        expect(onRetry).not.toHaveBeenCalled();
    });

    it("retries the resume library without submitting the review", async () => {
        const { onRetry, onSubmit } = setup([], false, "Could not load resumes.");
        await userEvent.click(screen.getByRole("button", { name: "Retry loading resumes" }));
        expect(onRetry).toHaveBeenCalledOnce();
        expect(onSubmit).not.toHaveBeenCalled();
    });
});
