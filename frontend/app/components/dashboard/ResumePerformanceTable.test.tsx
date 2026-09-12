import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ResumeAnalytics } from "../../lib/types";
import { ResumePerformanceTable } from "./ResumePerformanceTable";

const analytics: ResumeAnalytics = {
    minimumSampleSize: 5,
    rows: [
        {
            archivedAt: null,
            eligibleForComparison: false,
            interviewRate: 50,
            interviews: 1,
            isNoResume: false,
            name: "Product resume",
            offerRate: 0,
            offers: 0,
            responseRate: 50,
            responses: 1,
            resumeVersionId: "resume-1",
            submittedApplications: 2,
            targetRole: "Product Manager",
        },
        {
            archivedAt: "2026-08-01T00:00:00.000Z",
            eligibleForComparison: true,
            interviewRate: 60,
            interviews: 3,
            isNoResume: false,
            name: "Archived engineering resume",
            offerRate: 20,
            offers: 1,
            responseRate: 80,
            responses: 4,
            resumeVersionId: "resume-2",
            submittedApplications: 5,
            targetRole: null,
        },
    ],
};

describe("ResumePerformanceTable", () => {
    it("renders sample sizes, rates, and archived state without ranking small samples", () => {
        render(
            <ResumePerformanceTable
                analytics={analytics}
                error=""
                isLoading={false}
                onRetry={vi.fn()}
            />,
        );

        expect(screen.getByText("Product resume")).toBeTruthy();
        expect(screen.getByText("Need 3 more")).toBeTruthy();
        expect(screen.getByText("Archived")).toBeTruthy();
        expect(screen.getByText("Comparison-ready")).toBeTruthy();
        expect(screen.getAllByText("50%")).toHaveLength(2);
        expect(screen.queryByText(/winner|best/i)).toBeNull();
    });

    it("shows loading and retryable error states", async () => {
        const onRetry = vi.fn();
        const { rerender } = render(
            <ResumePerformanceTable
                analytics={{ minimumSampleSize: 5, rows: [] }}
                error=""
                isLoading
                onRetry={onRetry}
            />,
        );
        expect(screen.getByLabelText("Loading resume performance")).toBeTruthy();

        rerender(
            <ResumePerformanceTable
                analytics={{ minimumSampleSize: 5, rows: [] }}
                error="The server is unavailable."
                isLoading={false}
                onRetry={onRetry}
            />,
        );
        await userEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(onRetry).toHaveBeenCalledOnce();
    });
});
