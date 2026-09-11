/** Shared type-only contract; the frontend may import these types directly. */
export const PROTOCOL_VERSION = 1 as const;

export const CAPTURE_LIMITS = {
  sourceUrl: 2_000,
  sourceDomain: 255,
  pageTitle: 300,
  rawText: 100_000,
} as const;

export type CaptureWarning =
  | "NO_TEXT_SELECTED"
  | "PAGE_TITLE_TRUNCATED"
  | "SELECTED_TEXT_TRUNCATED";

export type JobCapture = {
  version: typeof PROTOCOL_VERSION;
  captureId: string;
  createdAt: number;
  sourceUrl: string;
  sourceDomain: string;
  pageTitle: string;
  rawText: string;
  warnings: CaptureWarning[];
};

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
