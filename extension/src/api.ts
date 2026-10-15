import { API_URL } from "./config.js";
import type { JobCapture } from "./protocol.js";

export type ExtensionUser = { id: string; name: string | null; email: string };
export type ExtensionSession = {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: ExtensionUser;
};

export type ImportDraft = {
  id: string;
  sourceUrl: string | null;
  source: string | null;
  parsedTitle: string | null;
  parsedCompany: string | null;
  parsedLocation: string | null;
  parsedSalaryMin: number | null;
  parsedSalaryMax: number | null;
  parsedDescription: string | null;
  confidence: number | null;
  convertedAt: string | null;
};

export type Application = { id: string; title: string; companyName: string | null };
export type ResumeVersion = { id: string; name: string; targetRole: string | null; uploadStatus: string; archivedAt: string | null };
export type DraftResult = { importDraft: ImportDraft; duplicateCandidates: Application[] };
export type SaveValues = {
  resumeVersionId: string;
  title: string;
  companyName: string;
  status: string;
  source: string;
  sourceUrl: string;
  location: string;
  salaryMin: string;
  salaryMax: string;
  description: string;
  notes: string;
  dateApplied: string;
  allowDuplicate: boolean;
};

const LEGACY_SESSION_KEY = "jobhazel.extension-session.v1";
const SESSION_KEY = `jobhazel.extension-session.v2:${API_URL}`;

function isSession(value: unknown): value is ExtensionSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<ExtensionSession>;
  return typeof session.accessToken === "string" && Boolean(session.accessToken) &&
    typeof session.refreshToken === "string" && Boolean(session.refreshToken) &&
    typeof session.refreshTokenExpiresAt === "string" && Number.isFinite(Date.parse(session.refreshTokenExpiresAt)) &&
    typeof session.user?.id === "string" && typeof session.user?.email === "string";
}

async function apiFetch(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, {
      ...init, credentials: "omit", redirect: "error", signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new Error("Could not reach JobHazel. Check your connection and retry.");
  }
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly body: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) throw new ApiError(String(body?.message ?? "JobHazel could not complete the request."), response.status, body ?? {});
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("JobHazel returned an invalid response. Please retry.");
  return body;
}

export async function readSession(): Promise<ExtensionSession | null> {
  // The old key did not identify its API. Never send that credential to a new environment.
  await chrome.storage.local.remove(LEGACY_SESSION_KEY);
  const stored = await chrome.storage.local.get(SESSION_KEY);
  const value: unknown = stored[SESSION_KEY];
  return isSession(value) ? value : null;
}

export async function storeSession(session: ExtensionSession | null): Promise<void> {
  if (session) await chrome.storage.local.set({ [SESSION_KEY]: session });
  else await chrome.storage.local.remove(SESSION_KEY);
}

export async function login(email: string, password: string): Promise<ExtensionSession> {
  const response = await apiFetch("/auth/extension/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = await parseResponse(response) as unknown as ExtensionSession;
  if (!isSession(session)) throw new Error("JobHazel returned an invalid session. Please sign in again.");
  await storeSession(session);
  return session;
}

export async function refresh(session: ExtensionSession): Promise<ExtensionSession> {
  const response = await apiFetch("/auth/extension/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  const refreshed = await parseResponse(response) as unknown as ExtensionSession;
  if (!isSession(refreshed)) throw new Error("JobHazel could not check your session. Please retry.");
  await storeSession(refreshed);
  return refreshed;
}

export async function logout(session: ExtensionSession): Promise<void> {
  const response = await apiFetch("/auth/extension/logout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  if (!response.ok && response.status !== 401) await parseResponse(response);
  await storeSession(null);
}

async function authorizedRequest(
  session: ExtensionSession,
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; session: ExtensionSession }> {
  const send = (active: ExtensionSession) => apiFetch(path, {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${active.accessToken}` },
  });
  let active = session;
  let response = await send(active);
  if (response.status === 401) {
    active = await refresh(active);
    response = await send(active);
  }
  return { response, session: active };
}

export async function createDraft(session: ExtensionSession, capture: JobCapture): Promise<{ result: DraftResult; session: ExtensionSession }> {
  const request = await authorizedRequest(session, "/imports/create-draft", {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": capture.captureId },
    body: JSON.stringify({
      sourceUrl: capture.sourceUrl,
      sourceDomain: capture.sourceDomain,
      pageTitle: capture.pageTitle,
      rawText: capture.rawText,
    }),
  });
  return { result: await parseResponse(request.response) as unknown as DraftResult, session: request.session };
}

export async function saveDraft(session: ExtensionSession, draftId: string, values: SaveValues): Promise<{ application: Application; session: ExtensionSession }> {
  const body = {
    ...values,
    salaryMin: values.salaryMin || null,
    salaryMax: values.salaryMax || null,
    dateApplied: values.dateApplied || null,
    resumeVersionId: values.resumeVersionId || null,
  };
  const request = await authorizedRequest(session, `/imports/${encodeURIComponent(draftId)}/convert`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await parseResponse(request.response);
  return { application: result.application as Application, session: request.session };
}

export async function listResumes(session: ExtensionSession): Promise<{ resumes: ResumeVersion[]; session: ExtensionSession }> {
  const request = await authorizedRequest(session, "/resumes");
  const result = await parseResponse(request.response);
  if (!Array.isArray(result.resumes)) throw new Error("JobHazel returned an invalid resume list. Please retry.");
  return { resumes: (result.resumes as ResumeVersion[]).filter((resume) => resume.uploadStatus === "READY" && !resume.archivedAt), session: request.session };
}
