import { ALLOWED_APP_ORIGINS, APP_URL } from "./config.js";
import {
  CAPTURE_TTL_MS,
  CaptureError,
  buildJobCapture,
  captureStorageKey,
  isStoredCapture,
  selectCaptureKeysToRemove,
  type CapturedPageContext,
  type StoredCapture,
} from "./capture.js";
import { getAuthorizedSenderOrigin, parseExternalRequest } from "./handoff.js";
import {
  PROTOCOL_VERSION,
  type CaptureWarning,
  type ErrorResponse,
  type ExternalRequest,
} from "./protocol.js";

const FEEDBACK_DURATION_MS = 8_000;

function readPageContext(): CapturedPageContext {
  return {
    sourceUrl: window.location.href,
    pageTitle: document.title ?? "",
    rawText: window.getSelection()?.toString() ?? "",
  };
}

async function pruneCaptureStorage(now = Date.now(), slotsToReserve = 0): Promise<void> {
  const allValues = await chrome.storage.session.get(null);
  const keysToRemove = selectCaptureKeysToRemove(allValues, now, slotsToReserve);
  if (keysToRemove.length) await chrome.storage.session.remove(keysToRemove);
}

function successFeedback(warnings: CaptureWarning[]): { badge: string; color: string; title: string } {
  if (warnings.includes("SELECTED_TEXT_TRUNCATED")) {
    return {
      badge: "CUT",
      color: "#a15c00",
      title: "Saved for review. Selected text was shortened to 100,000 characters.",
    };
  }
  if (warnings.includes("PAGE_TITLE_TRUNCATED")) {
    return {
      badge: "CUT",
      color: "#a15c00",
      title: "Saved for review. The page title was shortened to 300 characters.",
    };
  }
  if (warnings.includes("NO_TEXT_SELECTED")) {
    return {
      badge: "URL",
      color: "#a15c00",
      title: "Saved the URL and title. Add missing job details during review.",
    };
  }
  return { badge: "✓", color: "#34751f", title: "Job captured. Review it in JobHazel." };
}

async function setActionFeedback(badge: string, color: string, title: string): Promise<void> {
  await Promise.allSettled([
    chrome.action.setBadgeText({ text: badge }),
    chrome.action.setBadgeBackgroundColor({ color }),
    chrome.action.setTitle({ title }),
  ]);
}

async function showFeedback(badge: string, color: string, title: string): Promise<void> {
  await setActionFeedback(badge, color, title);
  setTimeout(() => {
    void chrome.action.setBadgeText({ text: "" });
    void chrome.action.setTitle({ title: "Save job to JobHazel" });
  }, FEEDBACK_DURATION_MS);
}

function errorMessage(error: unknown): string {
  if (error instanceof CaptureError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "JobHazel could not capture this page. Click to retry.";
}

async function handleToolbarClick(tab: chrome.tabs.Tab): Promise<void> {
  let storageKey: string | undefined;
  try {
    await setActionFeedback("…", "#4f772d", "Capturing this job posting…");
    if (!tab.id || !tab.url || !/^https?:\/\//i.test(tab.url)) {
      throw new CaptureError(
        "UNSUPPORTED_PAGE",
        "JobHazel cannot capture this browser page. Open an HTTP or HTTPS job posting and retry.",
      );
    }

    let injection: chrome.scripting.InjectionResult<CapturedPageContext>[];
    try {
      injection = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: readPageContext,
      });
    } catch {
      throw new CaptureError(
        "CAPTURE_FAILED",
        "JobHazel could not read this page. Reload the job posting and click the extension again.",
      );
    }
    const context = injection[0]?.result;
    if (!context) {
      throw new CaptureError("CAPTURE_FAILED", "JobHazel could not read this page. Reload it and retry.");
    }

    const capture = buildJobCapture(context, crypto.randomUUID());
    storageKey = captureStorageKey(capture.captureId);
    const record: StoredCapture = {
      capture,
      expiresAt: capture.createdAt + CAPTURE_TTL_MS,
    };
    try {
      await pruneCaptureStorage(capture.createdAt, 1);
      await chrome.storage.session.set({ [storageKey]: record });
    } catch {
      throw new CaptureError(
        "STORAGE_FAILED",
        "JobHazel could not temporarily store this capture. Close an old capture tab and retry.",
      );
    }

    let destinationTab: chrome.tabs.Tab;
    try {
      // Create a blank tab first so its ID can be bound to the capture before
      // JobHazel loads and asks for it in Phase 3.
      destinationTab = await chrome.tabs.create({ url: "about:blank", active: false });
    } catch {
      throw new CaptureError("CAPTURE_FAILED", "JobHazel could not open the import page. Click to retry.");
    }
    if (typeof destinationTab.id !== "number") {
      throw new CaptureError("CAPTURE_FAILED", "JobHazel could not open the import page. Click to retry.");
    }

    record.destinationTabId = destinationTab.id;
    try {
      await chrome.storage.session.set({ [storageKey]: record });
    } catch {
      await chrome.tabs.remove(destinationTab.id).catch(() => undefined);
      throw new CaptureError(
        "STORAGE_FAILED",
        "JobHazel could not finish securing this capture. Click the extension to retry.",
      );
    }

    const destination = new URL(APP_URL);
    destination.searchParams.set("capture", capture.captureId);
    try {
      await chrome.tabs.update(destinationTab.id, { url: destination.toString(), active: true });
    } catch {
      await chrome.tabs.remove(destinationTab.id).catch(() => undefined);
      throw new CaptureError("CAPTURE_FAILED", "JobHazel could not open the import page. Click to retry.");
    }
    const feedback = successFeedback(capture.warnings);
    await showFeedback(feedback.badge, feedback.color, feedback.title);
  } catch (error) {
    if (storageKey) {
      await chrome.storage.session.remove(storageKey).catch(() => undefined);
    }
    await showFeedback("!", "#b3261e", errorMessage(error));
  }
}

chrome.action.onClicked.addListener((tab) => {
  void handleToolbarClick(tab);
});

function externalError(code: ErrorResponse["error"]["code"], message: string): ErrorResponse {
  return { version: PROTOCOL_VERSION, ok: false, error: { code, message } };
}

async function readStoredCapture(captureId: string): Promise<StoredCapture | null> {
  const key = captureStorageKey(captureId);
  const stored = await chrome.storage.session.get(key);
  return isStoredCapture(stored[key]) ? stored[key] : null;
}

async function handleExternalRequest(
  message: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  if (!getAuthorizedSenderOrigin(sender, ALLOWED_APP_ORIGINS)) {
    return externalError("UNAUTHORIZED", "This page is not allowed to access JobHazel captures.");
  }

  const parsed = parseExternalRequest(message);
  if (!parsed.ok) {
    return parsed.reason === "UNSUPPORTED_VERSION"
      ? externalError("UNSUPPORTED_VERSION", "Update JobHazel and its extension, then retry.")
      : externalError("INVALID_MESSAGE", "The capture request is invalid.");
  }

  const request: ExternalRequest = parsed.request;
  const key = captureStorageKey(request.captureId);
  let record: StoredCapture | null;
  try {
    record = await readStoredCapture(request.captureId);
  } catch {
    return externalError("STORAGE_FAILED", "JobHazel could not access temporary capture storage.");
  }

  // Acknowledgment is idempotent. Once removed, repeating it has no effect.
  if (request.type === "jobhazel.capture.acknowledge" && !record) {
    return {
      version: PROTOCOL_VERSION,
      ok: true,
      type: request.type,
      captureId: request.captureId,
    };
  }

  if (!record) {
    return externalError(
      "CAPTURE_NOT_FOUND",
      "This capture is unavailable. Return to the job posting and capture it again.",
    );
  }

  if (record.destinationTabId !== sender.tab?.id) {
    return externalError("UNAUTHORIZED", "This capture belongs to a different browser tab.");
  }

  if (record.expiresAt <= Date.now()) {
    await chrome.storage.session.remove(key).catch(() => undefined);
    await pruneCaptureStorage().catch(() => undefined);
    return externalError(
      "CAPTURE_EXPIRED",
      "This capture expired. Return to the job posting and capture it again.",
    );
  }

  if (request.type === "jobhazel.capture.retrieve") {
    await pruneCaptureStorage().catch(() => undefined);
    return {
      version: PROTOCOL_VERSION,
      ok: true,
      type: request.type,
      capture: record.capture,
    };
  }

  try {
    await chrome.storage.session.remove(key);
  } catch {
    return externalError("STORAGE_FAILED", "JobHazel could not clear the temporary capture.");
  }
  return {
    version: PROTOCOL_VERSION,
    ok: true,
    type: request.type,
    captureId: request.captureId,
  };
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  void handleExternalRequest(message, sender)
    .then(sendResponse)
    .catch(() =>
      sendResponse(externalError("CAPTURE_FAILED", "JobHazel could not complete the capture handoff.")),
    );
  return true;
});
