import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    CAPTURE_MAX_AGE_MS,
    ExtensionBridgeError,
    PENDING_CAPTURE_STORAGE_KEY,
    clearPendingExtensionCapture,
    isJobCapture,
    readPendingExtensionCapture,
    readPendingExtensionHandoff,
    receiveExtensionCapture,
    removeCaptureParameter,
    storeExtensionDraftReference,
} from "./extension-bridge";

const extensionId = "abcdefghijklmnopabcdefghijklmnop";
const captureId = "123e4567-e89b-42d3-a456-426614174000";

function capture(createdAt = 1_000) {
    return {
        version: 1 as const,
        captureId,
        createdAt,
        sourceUrl: "https://jobs.example.com/role/7",
        sourceDomain: "jobs.example.com",
        pageTitle: "Software Engineer",
        rawText: "Responsibilities and qualifications",
        warnings: [],
    };
}

function runtimeForCapture(events: string[] = []) {
    const calls: unknown[] = [];
    return {
        calls,
        runtime: {
            sendMessage: (_extensionId: string, message: unknown, callback: (value: unknown) => void) => {
                calls.push(message);
                const request = message as { type: string };
                events.push(request.type === "jobhazel.capture.retrieve" ? "retrieve" : "acknowledge");
                if (request.type === "jobhazel.capture.retrieve") {
                    callback({
                        version: 1,
                        ok: true,
                        type: request.type,
                        capture: capture(),
                    });
                } else {
                    callback({
                        version: 1,
                        ok: true,
                        type: request.type,
                        captureId,
                    });
                }
            },
        },
    };
}

describe("extension bridge", () => {
    beforeEach(() => sessionStorage.clear());

    it("validates the full capture payload", () => {
        expect(isJobCapture(capture())).toBe(true);
        expect(isJobCapture({ ...capture(), sourceDomain: "evil.example" })).toBe(false);
        expect(isJobCapture({ ...capture(), warnings: ["UNKNOWN"] })).toBe(false);
    });

    it("stores a retrieved capture before acknowledging it", async () => {
        const events: string[] = [];
        const { runtime, calls } = runtimeForCapture(events);
        const storage = {
            getItem: (key: string) => sessionStorage.getItem(key),
            removeItem: (key: string) => sessionStorage.removeItem(key),
            setItem: (key: string, value: string) => {
                events.push("store");
                sessionStorage.setItem(key, value);
            },
        } as unknown as Storage;
        const receipt = await receiveExtensionCapture(captureId, extensionId, {
            runtime,
            storage,
            now: 1_100,
        });

        expect(receipt).toEqual({ capture: capture(), acknowledged: true });
        expect(events).toEqual(["retrieve", "store", "acknowledge"]);
        expect(calls).toEqual([
            { version: 1, type: "jobhazel.capture.retrieve", captureId },
            { version: 1, type: "jobhazel.capture.acknowledge", captureId },
        ]);
        expect(readPendingExtensionCapture(sessionStorage, 1_100)).toEqual(capture());
    });

    it("does not acknowledge when session storage fails", async () => {
        const { runtime, calls } = runtimeForCapture();
        const storage = {
            getItem: () => null,
            removeItem: () => undefined,
            setItem: () => {
                throw new Error("blocked");
            },
        } as unknown as Storage;

        await expect(
            receiveExtensionCapture(captureId, extensionId, { runtime, storage, now: 1_100 }),
        ).rejects.toMatchObject({ code: "STORAGE_FAILED" });
        expect(calls).toHaveLength(1);
    });

    it("reports missing or unreachable extension configuration", async () => {
        await expect(
            receiveExtensionCapture(captureId, null, { runtime: null }),
        ).rejects.toMatchObject({ code: "EXTENSION_NOT_CONFIGURED" });

        const runtime = {
            lastError: { message: "Could not establish connection" },
            sendMessage: (
                _extensionId: string,
                _message: unknown,
                callback: (value: unknown) => void,
            ) => callback(undefined),
        };
        await expect(
            receiveExtensionCapture(captureId, extensionId, { runtime }),
        ).rejects.toMatchObject({ code: "EXTENSION_UNAVAILABLE" });
    });

    it("surfaces typed extension errors with recapture guidance", async () => {
        const runtime = {
            sendMessage: (
                _extensionId: string,
                _message: unknown,
                callback: (value: unknown) => void,
            ) =>
                callback({
                    version: 1,
                    ok: false,
                    error: {
                        code: "CAPTURE_NOT_FOUND",
                        message: "Return to the job posting and capture it again.",
                    },
                }),
        };
        await expect(
            receiveExtensionCapture(captureId, extensionId, { runtime }),
        ).rejects.toMatchObject({
            code: "CAPTURE_NOT_FOUND",
            message: "Return to the job posting and capture it again.",
        });
    });

    it("expires and clears stale tab-local captures", () => {
        sessionStorage.setItem(PENDING_CAPTURE_STORAGE_KEY, JSON.stringify(capture()));
        expect(() =>
            readPendingExtensionCapture(sessionStorage, 1_000 + CAPTURE_MAX_AGE_MS),
        ).toThrow(ExtensionBridgeError);
        expect(sessionStorage.getItem(PENDING_CAPTURE_STORAGE_KEY)).toBeNull();
    });

    it("clears captures and removes only the capture query parameter", () => {
        sessionStorage.setItem(PENDING_CAPTURE_STORAGE_KEY, JSON.stringify(capture()));
        clearPendingExtensionCapture(sessionStorage);
        expect(sessionStorage.getItem(PENDING_CAPTURE_STORAGE_KEY)).toBeNull();

        const replaceState = vi.fn();
        removeCaptureParameter(
            { href: `https://jobhazel.com/?capture=${captureId}&view=jobs#saved` },
            { replaceState, state: null },
        );
        expect(replaceState).toHaveBeenCalledWith(null, "", "/?view=jobs#saved");
    });

    it("replaces raw capture data with a reload-safe draft reference", () => {
        sessionStorage.setItem(PENDING_CAPTURE_STORAGE_KEY, JSON.stringify(capture()));
        const reference = storeExtensionDraftReference(
            captureId,
            "cm12345678901234567890123",
            2_000,
            sessionStorage,
        );
        expect(readPendingExtensionHandoff(sessionStorage, 2_100)).toEqual(reference);
        expect(sessionStorage.getItem(PENDING_CAPTURE_STORAGE_KEY)).not.toContain(
            "Responsibilities and qualifications",
        );
        expect(readPendingExtensionCapture(sessionStorage, 2_100)).toBeNull();
    });
});
