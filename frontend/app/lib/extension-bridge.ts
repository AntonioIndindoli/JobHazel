// Structurally mirrors extension/src/protocol.ts. This stays local so Next does
// not bundle or traverse extension source; all cross-boundary data is validated.
export type CaptureWarning =
    | "NO_TEXT_SELECTED"
    | "PAGE_TITLE_TRUNCATED"
    | "SELECTED_TEXT_TRUNCATED";

export type ExtensionJobCapture = {
    version: 1;
    captureId: string;
    createdAt: number;
    sourceUrl: string;
    sourceDomain: string;
    pageTitle: string;
    rawText: string;
    warnings: CaptureWarning[];
};

type ProtocolErrorCode =
    | "INVALID_MESSAGE"
    | "UNSUPPORTED_VERSION"
    | "UNAUTHORIZED"
    | "CAPTURE_NOT_FOUND"
    | "CAPTURE_EXPIRED"
    | "UNSUPPORTED_PAGE"
    | "CAPTURE_FAILED"
    | "PAYLOAD_TOO_LARGE"
    | "STORAGE_FAILED";

type ErrorResponse = {
    version: 1;
    ok: false;
    error: { code: ProtocolErrorCode; message: string };
};

export const PENDING_CAPTURE_STORAGE_KEY = "jobhazel.pending-extension-capture.v1";
export const CAPTURE_MAX_AGE_MS = 30 * 60 * 1_000;
export const EXTENSION_MESSAGE_TIMEOUT_MS = 4_000;

const CAPTURE_ID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const CAPTURE_WARNINGS = new Set<CaptureWarning>([
    "NO_TEXT_SELECTED",
    "PAGE_TITLE_TRUNCATED",
    "SELECTED_TEXT_TRUNCATED",
]);

type ExtensionRuntime = {
    lastError?: { message?: string };
    sendMessage: (
        extensionId: string,
        message: unknown,
        callback: (response: unknown) => void,
    ) => void;
};

export type CaptureReceipt = {
    capture: ExtensionJobCapture;
    acknowledged: boolean;
};

export type ExtensionDraftReference = {
    version: 1;
    kind: "draft";
    captureId: string;
    draftId: string;
    createdAt: number;
};

export type PendingExtensionHandoff =
    | { kind: "capture"; capture: ExtensionJobCapture }
    | ExtensionDraftReference;

export type ExtensionBridgeErrorCode =
    | "INVALID_CAPTURE_ID"
    | "EXTENSION_NOT_CONFIGURED"
    | "EXTENSION_UNAVAILABLE"
    | "MESSAGE_TIMEOUT"
    | "INVALID_RESPONSE"
    | "CAPTURE_EXPIRED"
    | ErrorResponse["error"]["code"];

export class ExtensionBridgeError extends Error {
    constructor(
        public readonly code: ExtensionBridgeErrorCode,
        message: string,
    ) {
        super(message);
        this.name = "ExtensionBridgeError";
    }
}

export function isCaptureId(value: unknown): value is string {
    return typeof value === "string" && CAPTURE_ID_PATTERN.test(value);
}

export function isJobCapture(value: unknown): value is ExtensionJobCapture {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const capture = value as Partial<ExtensionJobCapture>;
    if (
        capture.version !== 1 ||
        !isCaptureId(capture.captureId) ||
        typeof capture.createdAt !== "number" ||
        !Number.isFinite(capture.createdAt) ||
        typeof capture.sourceUrl !== "string" ||
        capture.sourceUrl.length > 2_000 ||
        typeof capture.sourceDomain !== "string" ||
        capture.sourceDomain.length > 255 ||
        typeof capture.pageTitle !== "string" ||
        capture.pageTitle.length > 300 ||
        typeof capture.rawText !== "string" ||
        capture.rawText.length > 100_000 ||
        !Array.isArray(capture.warnings) ||
        !capture.warnings.every((warning) => CAPTURE_WARNINGS.has(warning))
    ) {
        return false;
    }

    try {
        const parsedUrl = new URL(capture.sourceUrl);
        return (
            (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") &&
            parsedUrl.hostname.toLowerCase() === capture.sourceDomain
        );
    } catch {
        return false;
    }
}

function currentRuntime(): ExtensionRuntime | null {
    const globalWithChrome = globalThis as typeof globalThis & {
        chrome?: { runtime?: ExtensionRuntime };
    };
    return globalWithChrome.chrome?.runtime ?? null;
}

function sendExtensionMessage(
    extensionId: string,
    message: unknown,
    runtime: ExtensionRuntime | null,
    timeoutMs: number,
): Promise<unknown> {
    if (!EXTENSION_ID_PATTERN.test(extensionId)) {
        return Promise.reject(
            new ExtensionBridgeError(
                "EXTENSION_NOT_CONFIGURED",
                "The JobHazel extension connection is not configured for this app build.",
            ),
        );
    }
    if (!runtime) {
        return Promise.reject(
            new ExtensionBridgeError(
                "EXTENSION_UNAVAILABLE",
                "JobHazel could not connect to the extension. Make sure it is installed and enabled, then reload this page.",
            ),
        );
    }

    return new Promise((resolve, reject) => {
        let settled = false;
        const timeout = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(
                new ExtensionBridgeError(
                    "MESSAGE_TIMEOUT",
                    "The extension did not respond. Reload the extension and try capturing the job again.",
                ),
            );
        }, timeoutMs);

        try {
            runtime.sendMessage(extensionId, message, (response) => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timeout);
                if (runtime.lastError) {
                    reject(
                        new ExtensionBridgeError(
                            "EXTENSION_UNAVAILABLE",
                            "JobHazel could not connect to the installed extension. Reload the extension and this page, then retry.",
                        ),
                    );
                    return;
                }
                resolve(response);
            });
        } catch {
            settled = true;
            window.clearTimeout(timeout);
            reject(
                new ExtensionBridgeError(
                    "EXTENSION_UNAVAILABLE",
                    "JobHazel could not connect to the extension. Make sure the configured extension is installed and enabled.",
                ),
            );
        }
    });
}

function responseError(response: unknown): ExtensionBridgeError | null {
    if (!response || typeof response !== "object" || Array.isArray(response)) return null;
    const candidate = response as Partial<ErrorResponse>;
    if (
        candidate.version === 1 &&
        candidate.ok === false &&
        candidate.error &&
        typeof candidate.error.code === "string" &&
        typeof candidate.error.message === "string"
    ) {
        return new ExtensionBridgeError(candidate.error.code, candidate.error.message);
    }
    return null;
}

function validateFreshCapture(
    capture: unknown,
    expectedId?: string,
    now = Date.now(),
): ExtensionJobCapture {
    if (!isJobCapture(capture) || (expectedId && capture.captureId !== expectedId)) {
        throw new ExtensionBridgeError(
            "INVALID_RESPONSE",
            "The extension returned an invalid capture. Return to the job posting and capture it again.",
        );
    }
    if (capture.createdAt + CAPTURE_MAX_AGE_MS <= now) {
        throw new ExtensionBridgeError(
            "CAPTURE_EXPIRED",
            "This capture expired. Return to the job posting and click the JobHazel extension again.",
        );
    }
    return capture;
}

export async function receiveExtensionCapture(
    captureId: string,
    extensionId: string | null,
    options: {
        runtime?: ExtensionRuntime | null;
        storage?: Storage;
        timeoutMs?: number;
        now?: number;
    } = {},
): Promise<CaptureReceipt> {
    if (!isCaptureId(captureId)) {
        throw new ExtensionBridgeError(
            "INVALID_CAPTURE_ID",
            "The capture link is invalid. Return to the job posting and capture it again.",
        );
    }
    if (!extensionId) {
        throw new ExtensionBridgeError(
            "EXTENSION_NOT_CONFIGURED",
            "The JobHazel extension connection is not configured. You can still use Import Job manually.",
        );
    }

    const runtime = options.runtime === undefined ? currentRuntime() : options.runtime;
    const timeoutMs = options.timeoutMs ?? EXTENSION_MESSAGE_TIMEOUT_MS;
    const storage = options.storage ?? window.sessionStorage;
    const response = await sendExtensionMessage(
        extensionId,
        { version: 1, type: "jobhazel.capture.retrieve", captureId },
        runtime,
        timeoutMs,
    );
    const error = responseError(response);
    if (error) throw error;

    const retrieveResponse = response as {
        version?: unknown;
        ok?: unknown;
        type?: unknown;
        capture?: unknown;
    };
    if (
        retrieveResponse.version !== 1 ||
        retrieveResponse.ok !== true ||
        retrieveResponse.type !== "jobhazel.capture.retrieve"
    ) {
        throw new ExtensionBridgeError("INVALID_RESPONSE", "The extension returned an invalid response.");
    }

    const capture = validateFreshCapture(retrieveResponse.capture, captureId, options.now);
    try {
        storage.setItem(PENDING_CAPTURE_STORAGE_KEY, JSON.stringify(capture));
    } catch {
        throw new ExtensionBridgeError(
            "STORAGE_FAILED",
            "JobHazel could not preserve this capture in the current tab. Check browser storage settings and retry.",
        );
    }

    let acknowledged = false;
    try {
        const acknowledgment = await sendExtensionMessage(
            extensionId,
            { version: 1, type: "jobhazel.capture.acknowledge", captureId },
            runtime,
            timeoutMs,
        );
        const ackError = responseError(acknowledgment);
        const ack = acknowledgment as {
            version?: unknown;
            ok?: unknown;
            type?: unknown;
            captureId?: unknown;
        };
        acknowledged =
            !ackError &&
            ack.version === 1 &&
            ack.ok === true &&
            ack.type === "jobhazel.capture.acknowledge" &&
            ack.captureId === captureId;
    } catch {
        // The local copy is authoritative after storage succeeds. The extension
        // copy remains isolated and expires automatically if acknowledgment fails.
    }

    return { capture, acknowledged };
}

export function readPendingExtensionCapture(
    storage: Storage = window.sessionStorage,
    now = Date.now(),
): ExtensionJobCapture | null {
    const pending = readPendingExtensionHandoff(storage, now);
    return pending?.kind === "capture" ? pending.capture : null;
}

function isDraftReference(value: unknown): value is ExtensionDraftReference {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const reference = value as Partial<ExtensionDraftReference>;
    return Boolean(
        reference.version === 1 &&
            reference.kind === "draft" &&
            isCaptureId(reference.captureId) &&
            typeof reference.draftId === "string" &&
            /^[a-z0-9]{20,64}$/i.test(reference.draftId) &&
            typeof reference.createdAt === "number" &&
            Number.isFinite(reference.createdAt),
    );
}

export function readPendingExtensionHandoff(
    storage: Storage = window.sessionStorage,
    now = Date.now(),
): PendingExtensionHandoff | null {
    const raw = storage.getItem(PENDING_CAPTURE_STORAGE_KEY);
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (isJobCapture(parsed)) {
            return { kind: "capture", capture: validateFreshCapture(parsed, undefined, now) };
        }
        if (isDraftReference(parsed)) {
            if (parsed.createdAt + CAPTURE_MAX_AGE_MS <= now) {
                throw new ExtensionBridgeError(
                    "CAPTURE_EXPIRED",
                    "This import session expired. Capture the job again or open Import Job manually.",
                );
            }
            return parsed;
        }
        throw new ExtensionBridgeError(
            "INVALID_RESPONSE",
            "The saved import session is invalid. Capture the job again.",
        );
    } catch (error) {
        storage.removeItem(PENDING_CAPTURE_STORAGE_KEY);
        throw error;
    }
}

export function storeExtensionDraftReference(
    captureId: string,
    draftId: string,
    createdAt = Date.now(),
    storage: Storage = window.sessionStorage,
): ExtensionDraftReference {
    const reference: ExtensionDraftReference = {
        version: 1,
        kind: "draft",
        captureId,
        draftId,
        createdAt,
    };
    if (!isDraftReference(reference)) {
        throw new ExtensionBridgeError("INVALID_RESPONSE", "JobHazel received an invalid draft reference.");
    }
    try {
        storage.setItem(PENDING_CAPTURE_STORAGE_KEY, JSON.stringify(reference));
    } catch {
        throw new ExtensionBridgeError(
            "STORAGE_FAILED",
            "The draft is ready, but JobHazel could not preserve it across a reload.",
        );
    }
    return reference;
}

export function clearPendingExtensionCapture(
    storage: Storage = window.sessionStorage,
): void {
    storage.removeItem(PENDING_CAPTURE_STORAGE_KEY);
}

export function removeCaptureParameter(
    location: Pick<Location, "href"> = window.location,
    history: Pick<History, "replaceState" | "state"> = window.history,
): void {
    const cleanUrl = new URL(location.href);
    cleanUrl.searchParams.delete("capture");
    history.replaceState(history.state, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
}

export function getExtensionCaptureMessage(error: unknown): string {
    if (error instanceof ExtensionBridgeError) return error.message;
    return "JobHazel could not retrieve this capture. Reload the page or capture the job again.";
}
