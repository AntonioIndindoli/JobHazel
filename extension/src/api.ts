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
export type DraftResult = { importDraft: ImportDraft; duplicateCandidates: Application[] };
export type SaveValues = {
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

const SESSION_KEY = "jobhazel.extension-session.v1";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly body: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new ApiError(String(body.message ?? "JobHazel could not complete the request."), response.status, body);
  return body;
}

export async function readSession(): Promise<ExtensionSession | null> {
  const stored = await chrome.storage.local.get(SESSION_KEY);
  const value = stored[SESSION_KEY] as Partial<ExtensionSession> | undefined;
  return value?.accessToken && value.refreshToken && value.user?.email ? value as ExtensionSession : null;
}

export async function storeSession(session: ExtensionSession | null): Promise<void> {
  if (session) await chrome.storage.local.set({ [SESSION_KEY]: session });
  else await chrome.storage.local.remove(SESSION_KEY);
}

export async function login(email: string, password: string): Promise<ExtensionSession> {
  const response = await fetch(`${API_URL}/auth/extension/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = await parseResponse(response) as unknown as ExtensionSession;
  await storeSession(session);
  return session;
}

export async function refresh(session: ExtensionSession): Promise<ExtensionSession> {
  const response = await fetch(`${API_URL}/auth/extension/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  const refreshed = await parseResponse(response) as unknown as ExtensionSession;
  await storeSession(refreshed);
  return refreshed;
}

export async function logout(session: ExtensionSession): Promise<void> {
  const response = await fetch(`${API_URL}/auth/extension/logout`, {
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
  const send = (active: ExtensionSession) => fetch(`${API_URL}${path}`, {
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
  };
  const request = await authorizedRequest(session, `/imports/${encodeURIComponent(draftId)}/convert`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await parseResponse(request.response);
  return { application: result.application as Application, session: request.session };
}
