/** Shared type-only contract; the frontend may import these types directly. */
export const PROTOCOL_VERSION = 1 as const;

export const CAPTURE_LIMITS = {
  sourceUrl: 2_000,
  sourceDomain: 255,
  pageTitle: 300,
  rawText: 100_000,
} as const;

export type JobCapture = {
  version: typeof PROTOCOL_VERSION;
  captureId: string;
  createdAt: number;
  sourceUrl: string;
  sourceDomain: string;
  pageTitle: string;
  rawText: string;
};

export type CaptureRequest = {
  version: typeof PROTOCOL_VERSION;
  type: "jobhazel.capture";
};

export type RetrieveCaptureRequest = {
  version: typeof PROTOCOL_VERSION;
  type: "jobhazel.capture.retrieve";
  captureId: string;
};

export type AcknowledgeCaptureRequest = {
  version: typeof PROTOCOL_VERSION;
  type: "jobhazel.capture.acknowledge";
  captureId: string;
};

// External pages may retrieve/acknowledge; capture is extension-internal only.
export type ExternalRequest = RetrieveCaptureRequest | AcknowledgeCaptureRequest;

export type ProtocolErrorCode =
  | "INVALID_MESSAGE"
  | "UNSUPPORTED_VERSION"
  | "UNAUTHORIZED"
  | "CAPTURE_NOT_FOUND"
  | "CAPTURE_EXPIRED"
  | "UNSUPPORTED_PAGE"
  | "CAPTURE_FAILED"
  | "PAYLOAD_TOO_LARGE"
  | "STORAGE_FAILED";

export type ErrorResponse = {
  version: typeof PROTOCOL_VERSION;
  ok: false;
  error: { code: ProtocolErrorCode; message: string };
};

export type CaptureResponse =
  | { version: 1; ok: true; type: "jobhazel.capture"; captureId: string }
  | ErrorResponse;

export type RetrieveCaptureResponse =
  | { version: 1; ok: true; type: "jobhazel.capture.retrieve"; capture: JobCapture }
  | ErrorResponse;

export type AcknowledgeCaptureResponse =
  | { version: 1; ok: true; type: "jobhazel.capture.acknowledge"; captureId: string }
  | ErrorResponse;
