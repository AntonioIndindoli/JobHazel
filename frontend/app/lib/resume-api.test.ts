import { describe, expect, it } from "vitest";

import {
    formatResumeSize,
    resumeNameFromFilename,
    validateResumeFile,
} from "./resume-api";

describe("resume file validation", () => {
    it("accepts a non-empty PDF up to 5 MB", () => {
        const file = new File(["%PDF-1.7"], "resume.pdf", {
            type: "application/pdf",
        });
        expect(validateResumeFile(file)).toBeNull();
    });

    it("rejects empty, oversized, and non-PDF files", () => {
        expect(
            validateResumeFile(new File([], "empty.pdf", { type: "application/pdf" })),
        ).toBe("The selected file is empty.");
        expect(
            validateResumeFile(
                new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.pdf", {
                    type: "application/pdf",
                }),
            ),
        ).toBe("PDF files must be 5 MB or smaller.");
        expect(
            validateResumeFile(new File(["hello"], "resume.txt", { type: "text/plain" })),
        ).toBe("Only PDF files are supported.");
    });

    it("formats resume names and file sizes for display", () => {
        expect(resumeNameFromFilename("product-manager_core.pdf")).toBe(
            "product manager core",
        );
        expect(formatResumeSize(1536)).toBe("2 KB");
        expect(formatResumeSize(2.25 * 1024 * 1024)).toBe("2.3 MB");
    });
});
