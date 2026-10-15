import {
  CAPTURE_TTL_MS,
  CaptureError,
  buildJobCapture,
  captureStorageKey,
  selectCaptureKeysToRemove,
  type StoredCapture,
} from "./capture.js";
import type { CaptureWarning } from "./protocol.js";
import { readPageContext, type PageContextResult } from "./page-context.js";
import { fillApplication, normalizeProfile } from "./autofill.js";

const FEEDBACK_DURATION_MS = 8_000;

async function pruneCaptureStorage(now = Date.now(), slotsToReserve = 0): Promise<void> {
  const allValues = await chrome.storage.session.get(null);
  const keysToRemove = selectCaptureKeysToRemove(allValues, now, slotsToReserve);
  if (keysToRemove.length) await chrome.storage.session.remove(keysToRemove);
}

function successFeedback(warnings: CaptureWarning[]): { badge: string; color: string; title: string } {
  if (warnings.includes("SELECTED_TEXT_TRUNCATED") || warnings.includes("PAGE_TITLE_TRUNCATED")) {
    return { badge: "CUT", color: "#a15c00", title: "Captured with shortened text. Review it in JobHazel." };
  }
  if (warnings.includes("NO_TEXT_SELECTED")) {
    return { badge: "URL", color: "#a15c00", title: "Captured the URL and title. Review it in JobHazel." };
  }
  return { badge: "✓", color: "#34751f", title: "Job captured. Review it in JobHazel." };
}

async function showFeedback(badge: string, color: string, title: string): Promise<void> {
  await Promise.allSettled([
    chrome.action.setBadgeText({ text: badge }),
    chrome.action.setBadgeBackgroundColor({ color }),
    chrome.action.setTitle({ title }),
  ]);
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

type CaptureResult = { ok: true } | { ok: false; message: string };

async function captureTab(tab: chrome.tabs.Tab): Promise<CaptureResult> {
  try {
    if (typeof tab.id !== "number") throw new CaptureError("UNSUPPORTED_PAGE", "Open a job posting and retry.");
    if (tab.url && !/^https?:\/\//i.test(tab.url)) {
      throw new CaptureError("UNSUPPORTED_PAGE", "JobHazel can capture only HTTP and HTTPS job postings. Open a posting and try again.");
    }
    let injection: chrome.scripting.InjectionResult<PageContextResult>[];
    try {
      injection = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readPageContext });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/Cannot access contents of url|Extension manifest must request permission|Missing host permission/i.test(message)) {
        throw new CaptureError("CAPTURE_FAILED", "Chrome blocked page access. In JobHazel's extension settings, set Site access to On all sites, then capture the posting again.");
      }
      throw new CaptureError("CAPTURE_FAILED", "Chrome could not read this posting. Wait for the page to finish loading, then capture it again.");
    }
    const context = injection?.[0]?.result;
    if (!context) throw new CaptureError("CAPTURE_FAILED", "JobHazel could not read this posting. Wait for the page to finish loading, then capture it again.");
    if ("error" in context) throw new CaptureError("CAPTURE_FAILED", context.error);

    const capture = buildJobCapture(context, crypto.randomUUID());
    const record: StoredCapture = { capture, expiresAt: capture.createdAt + CAPTURE_TTL_MS };
    await pruneCaptureStorage(capture.createdAt, 1);
    await chrome.storage.session.set({ [captureStorageKey(capture.captureId)]: record });
    const feedback = successFeedback(capture.warnings);
    await showFeedback(feedback.badge, feedback.color, feedback.title);
    return { ok: true };
  } catch (error) {
    const message = errorMessage(error);
    await showFeedback("!", "#b3261e", message);
    return { ok: false, message };
  }
}

async function handleToolbarClick(tab: chrome.tabs.Tab): Promise<void> {
  if (typeof tab.id === "number") {
    await chrome.sidePanel.open({ tabId: tab.id }).catch(() => undefined);
  }
  await captureTab(tab);
}

chrome.action.onClicked.addListener((tab) => handleToolbarClick(tab));

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "jobhazel.autofill.active") {
    // Only our extension UI can request writes; never accept requests from page scripts.
    if (_sender.id !== chrome.runtime.id || _sender.tab ||
      _sender.url !== chrome.runtime.getURL("side-panel.html")) return false;
    const query = typeof message.windowId === "number"
      ? { active: true, windowId: message.windowId } : { active: true, lastFocusedWindow: true };
    void (async () => {
      const [tab] = await chrome.tabs.query(query);
      if (typeof tab?.id !== "number" || (tab.url && !/^https?:\/\//i.test(tab.url))) {
        return { ok: false, message: "Open a job application on an HTTP or HTTPS page and try again." };
      }
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true }, func: fillApplication, args: [normalizeProfile(message.profile)],
      });
      if (!results.some((frame) => frame.result)) return { ok: false, message: "The page is still loading. Try autofill again." };
      const result = results.reduce((total, frame) => ({
        filled: total.filled + (frame.result?.filled ?? 0),
        preserved: total.preserved + (frame.result?.preserved ?? 0),
        missing: total.missing + (frame.result?.missing ?? 0),
      }), { filled: 0, preserved: 0, missing: 0 });
      return { ok: true, result };
    })().then(sendResponse).catch(() => sendResponse({ ok: false, message: "Chrome could not fill this page. Check JobHazel’s Site access in extension settings, wait for the form to load, and retry." }));
    return true;
  }
  if (message?.type !== "jobhazel.capture.active") return false;
  const query = typeof message.windowId === "number"
    ? { active: true, windowId: message.windowId } : { active: true, lastFocusedWindow: true };
  void chrome.tabs.query(query)
    .then(([tab]) => tab
      ? captureTab(tab)
      : ({ ok: false, message: "Open a job posting and try again." } as CaptureResult))
    .then(sendResponse)
    .catch(() => sendResponse({ ok: false, message: "JobHazel could not access the active tab." }));
  return true;
});
