import { APP_URL, API_URL, BUILD_ENV } from "./config.js";
import { setupAutofillPanel } from "./autofill-panel.js";
import { CAPTURE_STORAGE_PREFIX, isStoredCapture, type StoredCapture } from "./capture.js";
import {
  ApiError,
  createDraft,
  login,
  listResumes,
  logout,
  readSession,
  refresh,
  saveDraft,
  storeSession,
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
let currentView: View = "loading";
let captureInFlight = false;
let saving = false;
let queuedCaptureKey: string | null = null;
let resumesLoading = false;

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing element: ${id}`);
  return value as T;
}

function show(view: View): void {
  currentView = view;
  for (const name of views) element(`${name}-view`).classList.toggle("hidden", name !== view);
  updateAutofillUser(session?.user ?? null);
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

function processQueuedCapture(): void {
  if (!queuedCaptureKey || !session || saving || captureInFlight) return;
  if (currentView !== "ready" && currentView !== "saved") return;
  show("ready");
  setError("capture-error");
  void processLatestCapture();
}

async function processLatestCapture(): Promise<void> {
  if (!session || captureInFlight || saving || currentView !== "ready") return;
  captureInFlight = true;
  try {
    const stored = await chrome.storage.session.get(null);
    const pending = latestCapture(stored);
    if (!pending || processingCaptureId === pending.record.capture.captureId) {
      queuedCaptureKey = null;
      return;
    }
    if (queuedCaptureKey === pending.key) queuedCaptureKey = null;
    processingCaptureId = pending.record.capture.captureId;
    activeCaptureKey = pending.key;
    show("working");
    const response = await createDraft(session, pending.record.capture);
    session = response.session;
    draft = response.result;
    renderDraft(response.result);
    show("review");
    await loadResumeOptions();
  } catch (error) {
    processingCaptureId = null;
    if (error instanceof ApiError && error.status === 401) {
      await storeSession(null);
      session = null;
      show("login");
      setError("login-error", "Your session expired. Sign in to review this capture.");
      return;
    }
    show("ready");
    setError("capture-error", error instanceof Error ? error.message : "Draft creation failed. Capture the job again to retry.");
  } finally { captureInFlight = false; processQueuedCapture(); }
}

function renderDraft(result: DraftResult): void {
  const noResume = document.createElement("option");
  noResume.value = ""; noResume.textContent = "No resume";
  select("resumeVersionId").replaceChildren(noResume);
  select("resumeVersionId").value = "";
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
    resumeVersionId: select("resumeVersionId").value,
    title: input("title").value.trim(), companyName: input("companyName").value.trim(),
    status: select("status").value, source: input("source").value.trim(), sourceUrl: input("sourceUrl").value.trim(),
    location: input("location").value.trim(), salaryMin: input("salaryMin").value.trim(), salaryMax: input("salaryMax").value.trim(),
    description: textarea("description").value.trim(), notes: textarea("notes").value.trim(), dateApplied: input("dateApplied").value,
    allowDuplicate: input("allowDuplicate").checked,
  };
}

async function loadResumeOptions(): Promise<void> {
  if (!session || resumesLoading || saving) return;
  resumesLoading = true;
  setBusy(element<HTMLFormElement>("review-form"), true, "Loading resumes…");
  const picker = select("resumeVersionId");
  picker.disabled = true;
  element<HTMLButtonElement>("retry-resumes").disabled = true;
  setError("resume-error");
  element("retry-resumes").classList.add("hidden");
  element("resume-hint").textContent = "Loading resumes…";
  element("resume-hint").classList.remove("hidden");
  try {
    const result = await listResumes(session);
    session = result.session;
    const selected = picker.value;
    const emptyOption = document.createElement("option");
    emptyOption.value = ""; emptyOption.textContent = "No resume";
    picker.replaceChildren(emptyOption, ...result.resumes.map((resume) => {
      const option = document.createElement("option");
      option.value = resume.id;
      option.textContent = resume.name + (resume.targetRole ? ` — ${resume.targetRole}` : "");
      return option;
    }));
    picker.value = result.resumes.some((resume) => resume.id === selected) ? selected : "";
    element("resume-hint").textContent = result.resumes.length ? "" : "Upload a completed PDF in JobHazel’s Resumes to attach it here.";
    element("resume-hint").classList.toggle("hidden", result.resumes.length > 0);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) throw error;
    setError("resume-error", error instanceof Error ? error.message : "Could not load resumes. Please retry.");
    element("resume-hint").classList.add("hidden");
    element("retry-resumes").classList.remove("hidden");
  } finally {
    resumesLoading = false;
    picker.disabled = false;
    element<HTMLButtonElement>("retry-resumes").disabled = false;
    setBusy(element<HTMLFormElement>("review-form"), false, "");
  }
}

async function signOut(): Promise<void> {
  if (saving || captureInFlight || resumesLoading) return;
  try {
    if (session) await logout(session);
    session = null; draft = null; activeCaptureKey = null; processingCaptureId = null;
    show("login");
  } catch (error) {
    setError(currentView === "review" ? "review-error" : "capture-error", error instanceof Error ? error.message : "Sign out failed. Please retry.");
  }
}

async function captureActiveJob(button: HTMLButtonElement): Promise<void> {
  const originalLabel = button.textContent ?? "Capture current job";
  button.disabled = true;
  button.textContent = "Capturing…";
  setError("capture-error");
  try {
    const window = await chrome.windows.getCurrent();
    const result = await chrome.runtime.sendMessage({ type: "jobhazel.capture.active", windowId: window.id }) as
      | { ok: true }
      | { ok: false; message: string };
    if (!result?.ok) {
      show("ready");
      setError("capture-error", result?.message ?? "JobHazel could not capture the active tab.");
    } else {
      await processLatestCapture();
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
  element("environment-label").textContent = BUILD_ENV === "development"
    ? `Development · ${API_URL}` : "Connected to jobhazel.com";
  session = await readSession();
  if (session) {
    try { session = await refresh(session); }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await storeSession(null); session = null;
      } else {
        renderAccount(); show("ready");
        setError("capture-error", "Could not check your session. Your sign-in is saved; try again when connected.");
        return;
      }
    }
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
  if (!session || !draft || saving || captureInFlight || resumesLoading) return;
  saving = true;
  const captureKey = activeCaptureKey;
  setError("review-error"); setBusy(reviewForm, true, "Saving…");
  select("resumeVersionId").disabled = true;
  void saveDraft(session, draft.importDraft.id, reviewValues()).then(async (result) => {
    session = result.session;
    // Once saved, a local cleanup failure must not invite a second save.
    if (captureKey) await chrome.storage.session.remove(captureKey).catch(() => undefined);
    renderSaved(result.application); draft = null; activeCaptureKey = null; processingCaptureId = null; show("saved");
  }).catch((error) => {
    if (error instanceof ApiError && error.status === 401) {
      void storeSession(null); session = null; processingCaptureId = null;
      show("login");
      setError("login-error", "Your session expired. Sign in to review this capture.");
      return;
    }
    if (error instanceof ApiError && error.status === 409 && error.body.importDraft) {
      if (captureKey) void chrome.storage.session.remove(captureKey);
      draft = null; activeCaptureKey = null; processingCaptureId = null;
      element("saved-title").textContent = "Application already saved";
      element("saved-company").textContent = "Open JobHazel to view it in your account.";
      show("saved");
      return;
    }
    if (error instanceof ApiError && error.status === 409 && Array.isArray(error.body.duplicates)) {
      element("allow-duplicate-row").classList.remove("hidden");
      setError("review-error", "A possible duplicate was found. Check “Save this job anyway” to continue.");
      return;
    }
    setError("review-error", error instanceof Error ? error.message : "The application could not be saved.");
  }).finally(() => { saving = false; select("resumeVersionId").disabled = false; setBusy(reviewForm, false, ""); processQueuedCapture(); });
});

select("status").addEventListener("change", (event) => {
  renderStatusDot((event.currentTarget as HTMLSelectElement).value);
});

function renderSaved(application: Application): void {
  element("saved-title").textContent = application.title;
  element("saved-company").textContent = application.companyName ?? "Saved to your JobHazel account";
}

element("sign-out").addEventListener("click", () => void signOut());
element("retry-resumes").addEventListener("click", () => {
  void loadResumeOptions().catch((error) => {
    if (error instanceof ApiError && error.status === 401) {
      void storeSession(null); session = null; processingCaptureId = null;
      show("login"); setError("login-error", "Your session expired. Sign in to review this capture.");
    }
  });
});
element("review-sign-out").addEventListener("click", () => void signOut());
element("create-account").addEventListener("click", () => void chrome.tabs.create({ url: APP_URL }));
element("open-jobhazel").addEventListener("click", () => void chrome.tabs.create({ url: APP_URL }));
element("capture-job").addEventListener("click", (event) => void captureActiveJob(event.currentTarget as HTMLButtonElement));
element("capture-another").addEventListener("click", (event) => {
  show("ready");
  void captureActiveJob(event.currentTarget as HTMLButtonElement);
});
element("cancel-review").addEventListener("click", () => {
  if (saving || captureInFlight || resumesLoading) return;
  if (activeCaptureKey) void chrome.storage.session.remove(activeCaptureKey);
  draft = null; activeCaptureKey = null; processingCaptureId = null; show("ready");
  processQueuedCapture();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "session") return;
  const addedCapture = Object.entries(changes).find(([key, change]) =>
    key.startsWith(CAPTURE_STORAGE_PREFIX) && isStoredCapture(change.newValue));
  if (!addedCapture) return;
  queuedCaptureKey = addedCapture[0];
  // A toolbar click can capture another posting while this panel stays open.
  // Saving/removing a capture must not trigger this transition.
  processQueuedCapture();
});

const updateAutofillUser = setupAutofillPanel();
void initialize();
