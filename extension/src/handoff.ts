import type { ExternalRequest } from "./protocol.js";

export type ExternalSender = {
  origin?: string;
  url?: string;
  tab?: { id?: number };
};

export const CAPTURE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getAuthorizedSenderOrigin(
  sender: ExternalSender,
  allowedOrigins: readonly string[],
): string | null {
  if (!sender.url) return null;

  try {
    const urlOrigin = new URL(sender.url).origin;
    if (sender.origin && sender.origin !== urlOrigin) return null;
    return allowedOrigins.includes(urlOrigin) ? urlOrigin : null;
  } catch {
    return null;
  }
}

export function parseExternalRequest(value: unknown):
  | { ok: true; request: ExternalRequest }
  | { ok: false; reason: "INVALID_MESSAGE" | "UNSUPPORTED_VERSION" } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "INVALID_MESSAGE" };
  }

  const request = value as Partial<ExternalRequest>;
  if (request.version !== 1) return { ok: false, reason: "UNSUPPORTED_VERSION" };
  if (
    request.type !== "jobhazel.capture.retrieve" &&
    request.type !== "jobhazel.capture.acknowledge"
  ) {
    return { ok: false, reason: "INVALID_MESSAGE" };
  }
  if (typeof request.captureId !== "string" || !CAPTURE_ID_PATTERN.test(request.captureId)) {
    return { ok: false, reason: "INVALID_MESSAGE" };
  }

  return { ok: true, request: request as ExternalRequest };
}
