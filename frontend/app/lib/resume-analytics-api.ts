import type { ResumeAnalytics } from "./types";

type AuthenticatedFetch = (path: string, init?: RequestInit) => Promise<Response>;

export async function fetchResumeAnalytics(
    authenticatedFetch: AuthenticatedFetch,
): Promise<ResumeAnalytics> {
    const response = await authenticatedFetch("/resumes/analytics");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.message ?? "Resume analytics could not be loaded.");
    }
    return {
        minimumSampleSize: payload.minimumSampleSize ?? 5,
        rows: payload.rows ?? [],
    };
}
