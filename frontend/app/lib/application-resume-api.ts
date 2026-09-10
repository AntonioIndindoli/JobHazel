import type { Application } from "./types";

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

export async function setApplicationResume(
    apiFetch: ApiFetch,
    applicationId: string,
    resumeVersionId: string | null,
) {
    const response = await apiFetch(`/applications/${applicationId}/resume`, {
        method: "PUT",
        body: JSON.stringify({ resumeVersionId }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(payload.message ?? "Resume association could not be saved.");
    }

    return payload.application as Application;
}
