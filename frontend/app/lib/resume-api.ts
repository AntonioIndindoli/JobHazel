import type {
    ResumeMetadataUpdate,
    ResumeUploadInitiation,
    ResumeUploadMetadata,
    ResumeVersion,
} from "./types";

export const RESUME_MAX_BYTES = 5 * 1024 * 1024;
export const RESUME_PDF_MIME_TYPE = "application/pdf";

export type AuthenticatedRequest = (
    path: string,
    init?: RequestInit,
) => Promise<Response>;

type ErrorPayload = {
    code?: string;
    message?: string;
};

export class ResumeApiError extends Error {
    code: string | null;
    status: number;

    constructor(message: string, status = 0, code: string | null = null) {
        super(message);
        this.name = "ResumeApiError";
        this.status = status;
        this.code = code;
    }
}

async function parseJson<T>(response: Response): Promise<T> {
    const payload = (await response.json().catch(() => ({}))) as T & ErrorPayload;
    if (!response.ok) {
        throw new ResumeApiError(
            payload.message ?? "The resume request could not be completed.",
            response.status,
            payload.code ?? null,
        );
    }
    return payload;
}

export async function listResumes(request: AuthenticatedRequest) {
    const response = await request("/resumes?includeArchived=true");
    const payload = await parseJson<{ resumes?: ResumeVersion[] }>(response);
    return payload.resumes ?? [];
}

export async function initiateResumeUpload(
    request: AuthenticatedRequest,
    metadata: ResumeUploadMetadata,
) {
    const response = await request("/resumes/uploads", {
        method: "POST",
        body: JSON.stringify(metadata),
    });
    return parseJson<ResumeUploadInitiation>(response);
}

export async function completeResumeUpload(
    request: AuthenticatedRequest,
    resumeId: string,
) {
    const response = await request(`/resumes/${resumeId}/complete`, {
        method: "POST",
    });
    const payload = await parseJson<{ resume: ResumeVersion }>(response);
    return payload.resume;
}

export async function updateResumeMetadata(
    request: AuthenticatedRequest,
    resumeId: string,
    update: ResumeMetadataUpdate,
) {
    const response = await request(`/resumes/${resumeId}`, {
        method: "PATCH",
        body: JSON.stringify(update),
    });
    const payload = await parseJson<{ resume: ResumeVersion }>(response);
    return payload.resume;
}

export async function createResumeDownloadUrl(
    request: AuthenticatedRequest,
    resumeId: string,
) {
    const response = await request(`/resumes/${resumeId}/download-url`);
    const payload = await parseJson<{ downloadUrl: string }>(response);
    return payload.downloadUrl;
}

export async function permanentlyDeleteResume(
    request: AuthenticatedRequest,
    resumeId: string,
) {
    const response = await request(`/resumes/${resumeId}`, { method: "DELETE" });
    await parseJson<Record<string, never>>(response);
}

export function validateResumeFile(file: File | null) {
    if (!file) return "Choose a PDF to upload.";
    if (file.size < 1) return "The selected file is empty.";
    if (file.size > RESUME_MAX_BYTES) return "PDF files must be 5 MB or smaller.";

    const hasPdfExtension = file.name.toLowerCase().endsWith(".pdf");
    const hasPdfMimeType = !file.type || file.type.toLowerCase() === RESUME_PDF_MIME_TYPE;
    if (!hasPdfExtension || !hasPdfMimeType) return "Only PDF files are supported.";
    return null;
}

export function resumeNameFromFilename(filename: string) {
    return filename.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
}

export async function calculateResumeChecksum(file: File) {
    const source = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", source);
    return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
    ).join("");
}

export function uploadResumeFile({
    file,
    headers,
    onProgress,
    url,
}: {
    file: File;
    headers: Record<string, string>;
    onProgress: (progress: number) => void;
    url: string;
}) {
    return new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("PUT", url);
        for (const [name, value] of Object.entries(headers)) {
            request.setRequestHeader(name, value);
        }
        request.upload.addEventListener("progress", (event) => {
            if (!event.lengthComputable) return;
            onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
        });
        request.addEventListener("load", () => {
            if (request.status >= 200 && request.status < 300) {
                onProgress(100);
                resolve();
                return;
            }
            reject(new ResumeApiError("The file upload failed. Try again.", request.status));
        });
        request.addEventListener("error", () => {
            reject(new ResumeApiError("The file upload was interrupted. Try again."));
        });
        request.addEventListener("timeout", () => {
            reject(new ResumeApiError("The file upload timed out. Try again."));
        });
        request.send(file);
    });
}

export function formatResumeSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getResumeErrorMessage(error: unknown) {
    if (!(error instanceof ResumeApiError)) {
        return error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.";
    }

    const messages: Record<string, string> = {
        RESUME_CHECKSUM_MISMATCH: "The uploaded file could not be verified. Choose it again and retry.",
        RESUME_DUPLICATE_FILE: "This PDF is already in your resume library.",
        RESUME_INVALID_PDF: "This file does not appear to be a valid PDF.",
        RESUME_INVALID_STATE: "This resume is no longer available for that action. Refresh and try again.",
        RESUME_INVALID_TYPE: "Only PDF files are supported.",
        RESUME_IN_USE: "Remove this resume from its applications before permanently deleting it.",
        RESUME_QUOTA_EXCEEDED: "You have reached the active resume limit. Archive one to upload another.",
        RESUME_SIZE_MISMATCH: "The uploaded file size could not be verified. Choose it again and retry.",
        RESUME_STORAGE_UNAVAILABLE: "Resume storage is temporarily unavailable. Please retry in a moment.",
        RESUME_TOO_LARGE: "PDF files must be 5 MB or smaller.",
        RESUME_UPLOAD_MISSING: "The upload expired or was not received. Start the upload again.",
        RESUME_RATE_LIMITED: "Too many resume requests. Wait a moment and try again.",
    };
    return (error.code && messages[error.code]) || error.message;
}
