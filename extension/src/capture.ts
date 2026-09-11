import {
  CAPTURE_LIMITS,
  PROTOCOL_VERSION,
  type CaptureWarning,
  type JobCapture,
  type ProtocolErrorCode,
} from "./protocol.js";

export const CAPTURE_TTL_MS = 30 * 60 * 1_000;
export const MAX_PENDING_CAPTURES = 10;
export const CAPTURE_STORAGE_PREFIX = "jobhazel.capture.";

export type CapturedPageContext = {
  sourceUrl: string;
  pageTitle: string;
  rawText: string;
};

export type StoredCapture = {
  capture: JobCapture;
  expiresAt: number;
  destinationTabId?: number;
};

export class CaptureError extends Error {
  constructor(
    public readonly code: ProtocolErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CaptureError";
  }
}

export function captureStorageKey(captureId: string): string {
  return `${CAPTURE_STORAGE_PREFIX}${captureId}`;
}

export function buildJobCapture(
  context: CapturedPageContext,
  captureId: string,
  createdAt = Date.now(),
): JobCapture {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(context.sourceUrl);
  } catch {
    throw new CaptureError("UNSUPPORTED_PAGE", "This page does not have a valid web address.");
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new CaptureError("UNSUPPORTED_PAGE", "JobHazel can capture only HTTP and HTTPS pages.");
  }

  const sourceUrl = parsedUrl.toString();
  if (sourceUrl.length > CAPTURE_LIMITS.sourceUrl) {
    throw new CaptureError("PAYLOAD_TOO_LARGE", "This page URL is too long to import into JobHazel.");
  }

  const sourceDomain = parsedUrl.hostname.toLowerCase();
  if (sourceDomain.length > CAPTURE_LIMITS.sourceDomain) {
    throw new CaptureError("PAYLOAD_TOO_LARGE", "This page domain is too long to import into JobHazel.");
  }

  const originalTitle = context.pageTitle.trim();
  const originalText = context.rawText.trim();
  const warnings: CaptureWarning[] = [];
  if (!originalText) warnings.push("NO_TEXT_SELECTED");
  if (originalTitle.length > CAPTURE_LIMITS.pageTitle) warnings.push("PAGE_TITLE_TRUNCATED");
  if (originalText.length > CAPTURE_LIMITS.rawText) warnings.push("SELECTED_TEXT_TRUNCATED");

  return {
    version: PROTOCOL_VERSION,
    captureId,
    createdAt,
    sourceUrl,
    sourceDomain,
    pageTitle: originalTitle.slice(0, CAPTURE_LIMITS.pageTitle),
    rawText: originalText.slice(0, CAPTURE_LIMITS.rawText),
    warnings,
  };
}

export function isStoredCapture(value: unknown): value is StoredCapture {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<StoredCapture>;
  return Boolean(
    record.capture &&
      typeof record.capture.captureId === "string" &&
      typeof record.capture.createdAt === "number" &&
      typeof record.expiresAt === "number",
  );
}

export function selectCaptureKeysToRemove(
  allValues: Record<string, unknown>,
  now = Date.now(),
  slotsToReserve = 0,
): string[] {
  const malformedKeys: string[] = [];
  const pending: Array<{ key: string; value: StoredCapture }> = [];

  for (const [key, value] of Object.entries(allValues)) {
    if (!key.startsWith(CAPTURE_STORAGE_PREFIX)) continue;
    if (isStoredCapture(value)) pending.push({ key, value });
    else malformedKeys.push(key);
  }

  pending.sort((left, right) => left.value.capture.createdAt - right.value.capture.createdAt);
  const expiredKeys = pending
    .filter(({ value }) => value.expiresAt <= now)
    .map(({ key }) => key);
  const active = pending.filter(({ value }) => value.expiresAt > now);
  const capacity = Math.max(0, MAX_PENDING_CAPTURES - slotsToReserve);
  const overflowCount = Math.max(0, active.length - capacity);
  const overflowKeys = active.slice(0, overflowCount).map(({ key }) => key);
  return [...new Set([...malformedKeys, ...expiredKeys, ...overflowKeys])];
}
