import {
  CAPTURE_TTL_MS,
  CaptureError,
  buildJobCapture,
  captureStorageKey,
  selectCaptureKeysToRemove,
  type CapturedPageContext,
  type StoredCapture,
} from "./capture.js";
import type { CaptureWarning } from "./protocol.js";

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

async function handleToolbarClick(tab: chrome.tabs.Tab): Promise<void> {
  if (typeof tab.id === "number") {
    await chrome.sidePanel.open({ tabId: tab.id }).catch(() => undefined);
  }

  try {
    if (!tab.id || !tab.url || !/^https?:\/\//i.test(tab.url)) {
      throw new CaptureError("UNSUPPORTED_PAGE", "Open an HTTP or HTTPS job posting and retry.");
    }
    const injection = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readPageContext,
    }).catch(() => null);
    const context = injection?.[0]?.result;
    if (!context) throw new CaptureError("CAPTURE_FAILED", "JobHazel could not read this page. Reload it and retry.");

    const capture = buildJobCapture(context, crypto.randomUUID());
    const record: StoredCapture = { capture, expiresAt: capture.createdAt + CAPTURE_TTL_MS };
    await pruneCaptureStorage(capture.createdAt, 1);
    await chrome.storage.session.set({ [captureStorageKey(capture.captureId)]: record });
    const feedback = successFeedback(capture.warnings);
    await showFeedback(feedback.badge, feedback.color, feedback.title);
  } catch (error) {
    await showFeedback("!", "#b3261e", errorMessage(error));
  }
}

chrome.action.onClicked.addListener((tab) => handleToolbarClick(tab));
