import { describe, expect, it, vi } from "vitest";

import { setApplicationResume } from "./application-resume-api";

describe("setApplicationResume", () => {
    it("uses the authenticated application association endpoint", async () => {
        const request = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    application: {
                        id: "application-1",
                        resumeVersionId: "resume-1",
                        resumeVersion: { id: "resume-1", name: "Product resume" },
                    },
                }),
                { status: 200, headers: { "content-type": "application/json" } },
            ),
        );

        const application = await setApplicationResume(
            request,
            "application-1",
            "resume-1",
        );

        expect(request).toHaveBeenCalledWith("/applications/application-1/resume", {
            method: "PUT",
            body: JSON.stringify({ resumeVersionId: "resume-1" }),
        });
        expect(application.resumeVersion?.name).toBe("Product resume");
    });

    it("supports removing the association and surfaces API errors", async () => {
        const request = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ message: "Resume not found." }), {
                status: 404,
                headers: { "content-type": "application/json" },
            }),
        );

        await expect(
            setApplicationResume(request, "application-1", null),
        ).rejects.toThrow("Resume not found.");
        expect(request.mock.calls[0][1]?.body).toBe(
            JSON.stringify({ resumeVersionId: null }),
        );
    });
});
