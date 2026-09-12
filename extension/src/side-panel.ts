import { APP_URL } from "./config.js";
import { CAPTURE_STORAGE_PREFIX, isStoredCapture, type StoredCapture } from "./capture.js";
import {
  ApiError,
  createDraft,
  login,
  logout,
  readSession,
  refresh,
  saveDraft,
  type Application,
  type DraftResult,
  type ExtensionSession,
  type SaveValues,
} from "./api.js";

type View = "loading" | "login" | "ready" | "working" | "review" | "saved";
const views: View[] = ["loading", "login", "ready", "working", "review", "saved"];
let session: ExtensionSession | null = null;
let draft: DraftResult | null = null;
let activeCaptureKey: string | null = null;
let processingCaptureId: string | null = null;

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing element: ${id}`);
  return value as T;
}

function show(view: View): void {
  for (const name of views) element(`${name}-view`).classList.toggle("hidden", name !== view);
}

function setError(id: string, message = ""): void {
  const node = element(id);
  node.textContent = message;
  node.classList.toggle("hidden", !message);
}

function setBusy(form: HTMLFormElement, busy: boolean, label: string): void {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!button) return;
  button.disabled = busy;
  button.textContent = busy ? label : button.dataset.label ?? button.textContent;
}

function input(id: string): HTMLInputElement { return element<HTMLInputElement>(id); }
function textarea(id: string): HTMLTextAreaElement { return element<HTMLTextAreaElement>(id); }
function select(id: string): HTMLSelectElement { return element<HTMLSelectElement>(id); }

function renderStatusDot(status: string): void {
  const normalized = ["saved", "applied", "interviewing", "offer", "rejected", "withdrawn"]
    .includes(status.toLowerCase()) ? status.toLowerCase() : "saved";
  element("status-dot").className = `status-dot status-${normalized}`;
}

function todayDateInput(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function renderAccount(): void {
  const email = session?.user.email ?? "";
  element("account-email").textContent = email;
  element("review-account").textContent = email;
}

function latestCapture(values: Record<string, unknown>): { key: string; record: StoredCapture } | null {
  const entry = Object.entries(values)
    .filter((entry): entry is [string, StoredCapture] => entry[0].startsWith(CAPTURE_STORAGE_PREFIX) && isStoredCapture(entry[1]))
    .filter(([, record]) => record.expiresAt > Date.now())
    .sort((left, right) => right[1].capture.createdAt - left[1].capture.createdAt)[0] ?? null;
  return entry ? { key: entry[0], record: entry[1] } : null;
}

async function processLatestCapture(): Promise<void> {
  if (!session) return;
  const stored = await chrome.storage.session.get(null);
  const pending = latestCapture(stored);
  if (!pending || processingCaptureId === pending.record.capture.captureId) return;
  processingCaptureId = pending.record.capture.captureId;
  activeCaptureKey = pending.key;
  show("working");
  try {
    const response = await createDraft(session, pending.record.capture);
    session = response.session;
    draft = response.result;
    renderDraft(response.result);
    show("review");
  } catch (error) {
    processingCaptureId = null;
    if (error instanceof ApiError && error.status === 401) {
      await chrome.storage.local.remove("jobhazel.extension-session.v1");
      session = null;
      show("login");
      setError("login-error", "Your session expired. Sign in to review this capture.");
      return;
    }
    show("ready");
    setError("login-error", "");
    element("ready-view").querySelector(".empty-state")!.innerHTML = `<h1>Draft creation failed</h1><p>${escapeHtml(error instanceof Error ? error.message : "Try clicking the toolbar icon again.")}</p>`;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]!);
}

function renderDraft(result: DraftResult): void {
  const value = result.importDraft;
  input("title").value = value.parsedTitle ?? "";
  input("companyName").value = value.parsedCompany ?? "";
  select("status").value = "APPLIED";
  renderStatusDot("APPLIED");
  input("dateApplied").value = todayDateInput();
  input("location").value = value.parsedLocation ?? "";
  input("source").value = value.source ?? "";
  input("sourceUrl").value = value.sourceUrl ?? "";
  input("salaryMin").value = value.parsedSalaryMin?.toString() ?? "";
  input("salaryMax").value = value.parsedSalaryMax?.toString() ?? "";
  textarea("description").value = value.parsedDescription ?? "";
  textarea("notes").value = "";
  const confidence = element("confidence");
  confidence.textContent = typeof value.confidence === "number" ? `${Math.round(value.confidence * 100)}% parser confidence` : "";
  confidence.classList.toggle("hidden", typeof value.confidence !== "number");
  const duplicates = element("duplicates");
  duplicates.textContent = result.duplicateCandidates.length
    ? `Possible duplicate: ${result.duplicateCandidates.map((item) => `${item.title}${item.companyName ? ` at ${item.companyName}` : ""}`).join(", ")}`
    : "";
  duplicates.classList.toggle("hidden", !result.duplicateCandidates.length);
  element("allow-duplicate-row").classList.toggle("hidden", !result.duplicateCandidates.length);
  input("allowDuplicate").checked = false;
  setError("review-error");
}

function reviewValues(): SaveValues {
  return {
    title: input("title").value.trim(), companyName: input("companyName").value.trim(),
    status: select("status").value, source: input("source").value.trim(), sourceUrl: input("sourceUrl").value.trim(),
    location: input("location").value.trim(), salaryMin: input("salaryMin").value.trim(), salaryMax: input("salaryMax").value.trim(),
    description: textarea("description").value.trim(), notes: textarea("notes").value.trim(), dateApplied: input("dateApplied").value,
    allowDuplicate: input("allowDuplicate").checked,
  };
}

async function signOut(): Promise<void> {
  if (session) await logout(session);
  session = null; draft = null; processingCaptureId = null;
  show("login");
}

async function captureActiveJob(button: HTMLButtonElement): Promise<void> {
  const originalLabel = button.textContent ?? "Capture current job";
  button.disabled = true;
  button.textContent = "Capturing…";
  setError("capture-error");
  try {
    const result = await chrome.runtime.sendMessage({ type: "jobhazel.capture.active" }) as
      | { ok: true }
      | { ok: false; message: string };
    if (!result?.ok) {
      show("ready");
      setError("capture-error", result?.message ?? "JobHazel could not capture the active tab.");
    }
  } catch {
    show("ready");
    setError("capture-error", "JobHazel could not capture the active tab. Reload the extension and retry.");
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

async function initialize(): Promise<void> {
  session = await readSession();
  if (session) {
    try { session = await refresh(session); }
    catch { await chrome.storage.local.remove("jobhazel.extension-session.v1"); session = null; }
  }
  if (!session) { show("login"); return; }
  renderAccount(); show("ready"); await processLatestCapture();
}

const loginForm = element<HTMLFormElement>("login-form");
loginForm.querySelector<HTMLButtonElement>('button[type="submit"]')!.dataset.label = "Sign in";
loginForm.addEventListener("submit", (event) => {
  event.preventDefault(); setError("login-error"); setBusy(loginForm, true, "Signing in…");
  void login(input("email").value, input("password").value).then(async (value) => {
    session = value; input("password").value = ""; renderAccount(); show("ready"); await processLatestCapture();
  }).catch((error) => setError("login-error", error instanceof Error ? error.message : "Sign in failed.")).finally(() => setBusy(loginForm, false, ""));
});

const reviewForm = element<HTMLFormElement>("review-form");
reviewForm.querySelector<HTMLButtonElement>('button[type="submit"]')!.dataset.label = "Save application";
reviewForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!session || !draft) return;
  setError("review-error"); setBusy(reviewForm, true, "Saving…");
  void saveDraft(session, draft.importDraft.id, reviewValues()).then(async (result) => {
    session = result.session;
    if (activeCaptureKey) await chrome.storage.session.remove(activeCaptureKey);
    renderSaved(result.application); draft = null; activeCaptureKey = null; processingCaptureId = null; show("saved");
  }).catch((error) => {
    if (error instanceof ApiError && error.status === 409 && Array.isArray(error.body.duplicates)) {
      element("allow-duplicate-row").classList.remove("hidden");
      setError("review-error", "A possible duplicate was found. Check “Save this job anyway” to continue.");
      return;
    }
    setError("review-error", error instanceof Error ? error.message : "The application could not be saved.");
  }).finally(() => setBusy(reviewForm, false, ""));
});

select("status").addEventListener("change", (event) => {
  renderStatusDot((event.currentTarget as HTMLSelectElement).value);
});

function renderSaved(application: Application): void {
  element("saved-title").textContent = application.title;
  element("saved-company").textContent = application.companyName ?? "Saved to your JobHazel account";
}

element("sign-out").addEventListener("click", () => void signOut());
element("review-sign-out").addEventListener("click", () => void signOut());
element("create-account").addEventListener("click", () => void chrome.tabs.create({ url: APP_URL }));
element("open-jobhazel").addEventListener("click", () => void chrome.tabs.create({ url: APP_URL }));
element("capture-job").addEventListener("click", (event) => void captureActiveJob(event.currentTarget as HTMLButtonElement));
element("capture-another").addEventListener("click", (event) => {
  show("ready");
  void captureActiveJob(event.currentTarget as HTMLButtonElement);
});
element("cancel-review").addEventListener("click", () => {
  if (activeCaptureKey) void chrome.storage.session.remove(activeCaptureKey);
  draft = null; activeCaptureKey = null; processingCaptureId = null; show("ready");
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && Object.keys(changes).some((key) => key.startsWith(CAPTURE_STORAGE_PREFIX))) void processLatestCapture();
});

void initialize();
