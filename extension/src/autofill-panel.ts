import { API_URL } from "./config.js";
import type { ExtensionUser } from "./api.js";
import { PROFILE_FIELDS, normalizeProfile, type AutofillResult } from "./autofill.js";

export function setupAutofillPanel(): (user: ExtensionUser | null) => void {
  const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const form = element<HTMLFormElement>("autofill-form");
  const button = element<HTMLButtonElement>("autofill-current");
  const status = element("autofill-status");
  let currentKey: string | null = null;
  let busy = false;
  let loaded = false;
  const read = () => normalizeProfile(Object.fromEntries(PROFILE_FIELDS.map((key) => [key, element<HTMLInputElement>(`autofill-${key}`).value])));
  const message = (text: string) => { status.textContent = text; };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!currentKey || busy || !loaded) return;
    const key = currentKey;
    busy = true; button.disabled = true;
    void (async () => {
      try {
        const profile = read();
        if (!Object.values(profile).some(Boolean)) { message("Add your contact details before autofilling."); return; }
        await chrome.storage.local.set({ [key]: profile });
        if (currentKey !== key) return;
        const window = await chrome.windows.getCurrent();
        if (currentKey !== key) return;
        message("Filling blank fields…");
        const response = await chrome.runtime.sendMessage({ type: "jobhazel.autofill.active", windowId: window.id, profile }) as
          { ok: true; result: AutofillResult } | { ok: false; message: string };
        if (currentKey !== key) return;
        if (!response?.ok) throw new Error(response?.message ?? "Could not fill this page. Please retry.");
        const { filled, preserved, missing } = response.result;
        message(`${filled ? `Filled ${filled} field${filled === 1 ? "" : "s"}.` : "No blank supported fields found."} ${preserved} existing answers kept. ${missing ? `${missing} fields need manual input. ` : ""}Review the application before submitting.`);
      } catch (error) {
        if (currentKey === key) message(error instanceof Error ? error.message : "Could not autofill. Please retry.");
      } finally { busy = false; button.disabled = !loaded; }
    })();
  });
  element("autofill-clear").addEventListener("click", () => {
    if (!currentKey || busy || !loaded) return;
    const key = currentKey;
    busy = true; button.disabled = true;
    void chrome.storage.local.remove(key).then(() => {
      if (currentKey !== key) return;
      for (const field of PROFILE_FIELDS) element<HTMLInputElement>(`autofill-${field}`).value = "";
      message("Saved autofill details cleared from this browser.");
    }).catch(() => { if (currentKey === key) message("Could not clear saved details. Please retry."); })
      .finally(() => { busy = false; button.disabled = !loaded; });
  });
  return (user) => {
    element("autofill-card").classList.toggle("hidden", !user);
    const key = user ? `jobhazel.autofill.v1:${API_URL}:${user.id}` : null;
    if (key === currentKey) return;
    currentKey = key; loaded = false; button.disabled = true; message("");
    for (const field of PROFILE_FIELDS) element<HTMLInputElement>(`autofill-${field}`).value = "";
    if (!key || !user) return;
    void chrome.storage.local.get(key).then((stored) => {
      if (currentKey !== key) return;
      const profile = normalizeProfile(stored[key] ?? { fullName: user.name ?? "", email: user.email });
      for (const field of PROFILE_FIELDS) element<HTMLInputElement>(`autofill-${field}`).value = profile[field];
      loaded = true; button.disabled = busy;
    }).catch(() => {
      if (currentKey === key) message("Could not load autofill details. Reopen the panel to retry.");
    });
  };
}
