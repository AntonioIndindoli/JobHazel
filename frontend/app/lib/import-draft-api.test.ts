import { describe, expect, it, vi } from "vitest";

import {
    ImportDraftRequestError,
    requestExistingImportDraft,
    requestImportDraft,
} from "./import-draft-api";

const draft = {
    id: "cm12345678901234567890123",
    sourceUrl: "https://jobs.example.com/7",
    sourceDomain: "jobs.example.com",
    source: "Company Website",
    pageTitle: "Engineer",
    rawText: "Description",
    parsedTitle: "Engineer",
    parsedCompany: "Example",
    parsedLocation: null,
    parsedSalaryMin: null,
    parsedSalaryMax: null,
    parsedDescription: "Description",
    confidence: 0.8,
    createdAt: new Date().toISOString(),
    convertedAt: null,
};

describe("import draft API", () => {
    it("sends only capture fields and uses the capture ID as an idempotency header", async () => {
        const authenticatedFetch = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ importDraft: draft, duplicateCandidates: [] }), {
                status: 201,
                headers: { "Content-Type": "application/json" },
            }),
        );
        const captureId = "123e4567-e89b-42d3-a456-426614174000";
        await requestImportDraft(
            authenticatedFetch,
            {
                sourceUrl: draft.sourceUrl,
                sourceDomain: draft.sourceDomain,
                pageTitle: draft.pageTitle,
                rawText: draft.rawText,
            },
            captureId,
        );

        expect(authenticatedFetch).toHaveBeenCalledWith("/imports/create-draft", {
            method: "POST",
            headers: { "Idempotency-Key": captureId },
            body: JSON.stringify({
                sourceUrl: draft.sourceUrl,
                sourceDomain: draft.sourceDomain,
                pageTitle: draft.pageTitle,
                rawText: draft.rawText,
            }),
        });
    });

    it("restores a draft with duplicate candidates", async () => {
        const duplicate = { id: "application-1", title: "Engineer" };
        const authenticatedFetch = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({ importDraft: draft, duplicateCandidates: [duplicate] }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            ),
        );
        const result = await requestExistingImportDraft(authenticatedFetch, draft.id);
        expect(authenticatedFetch).toHaveBeenCalledWith(`/imports/${draft.id}`);
        expect(result.duplicateCandidates).toEqual([duplicate]);
    });

    it("preserves a retryable message when the network result is ambiguous", async () => {
        const authenticatedFetch = vi.fn().mockRejectedValue(new Error("offline"));
        await expect(
            requestImportDraft(authenticatedFetch, {
                sourceUrl: draft.sourceUrl,
                sourceDomain: draft.sourceDomain,
                pageTitle: draft.pageTitle,
                rawText: draft.rawText,
            }),
        ).rejects.toEqual(
            new ImportDraftRequestError(
                "The import service is unavailable. Your captured job is still here; click Create draft to retry.",
                null,
            ),
        );
    });
});
