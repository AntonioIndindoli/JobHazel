import type {
    Application,
    ImportCaptureValues,
    ImportDraft,
    ParserDebug,
} from "./types";

export type ImportDraftCapture = ImportCaptureValues & {
    sourceDomain?: string;
};

export type ImportDraftResult = {
    importDraft: ImportDraft;
    duplicateCandidates: Application[];
    parserDebug: ParserDebug | null;
};

export class ImportDraftRequestError extends Error {
    constructor(
        message: string,
        public readonly status: number | null,
    ) {
        super(message);
        this.name = "ImportDraftRequestError";
    }
}

type AuthenticatedFetch = (path: string, init?: RequestInit) => Promise<Response>;

function normalizeResult(data: Record<string, unknown>): ImportDraftResult {
    const importDraft = data.importDraft as ImportDraft | undefined;
    if (!importDraft || typeof importDraft.id !== "string") {
        throw new ImportDraftRequestError("The import response was incomplete. Please retry.", null);
    }
    return {
        importDraft,
        duplicateCandidates: Array.isArray(data.duplicateCandidates)
            ? (data.duplicateCandidates as Application[])
            : [],
        parserDebug:
            data.debug && typeof data.debug === "object"
                ? (data.debug as ParserDebug)
                : null,
    };
}

async function parseResponse(response: Response): Promise<ImportDraftResult> {
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
        throw new ImportDraftRequestError(
            typeof data.message === "string" ? data.message : "Import draft request failed.",
            response.status,
        );
    }
    return normalizeResult(data);
}

export async function requestImportDraft(
    authenticatedFetch: AuthenticatedFetch,
    capture: ImportDraftCapture,
    captureId?: string,
): Promise<ImportDraftResult> {
    let response: Response;
    try {
        response = await authenticatedFetch("/imports/create-draft", {
            method: "POST",
            headers: captureId ? { "Idempotency-Key": captureId } : undefined,
            body: JSON.stringify({
                sourceUrl: capture.sourceUrl,
                sourceDomain: capture.sourceDomain,
                pageTitle: capture.pageTitle,
                rawText: capture.rawText,
            }),
        });
    } catch {
        throw new ImportDraftRequestError(
            "The import service is unavailable. Your captured job is still here; click Create draft to retry.",
            null,
        );
    }
    return parseResponse(response);
}

export async function requestExistingImportDraft(
    authenticatedFetch: AuthenticatedFetch,
    draftId: string,
): Promise<ImportDraftResult> {
    let response: Response;
    try {
        response = await authenticatedFetch(`/imports/${encodeURIComponent(draftId)}`);
    } catch {
        throw new ImportDraftRequestError(
            "JobHazel could not restore the import draft. Check your connection and retry.",
            null,
        );
    }
    return parseResponse(response);
}
