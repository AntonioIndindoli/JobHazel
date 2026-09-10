import { APP_URL } from "./config.js";

// Phase 1 scaffold: page capture and external message listeners arrive later.
chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: APP_URL }).catch(() => {
    void chrome.action.setBadgeText({ text: "!" });
    void chrome.action.setTitle({ title: "Could not open JobHazel. Click to retry." });
  });
});
