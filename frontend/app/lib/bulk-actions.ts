import type { BulkChange, BulkResult } from "../components/BulkActions";

export type BulkResource = "applications" | "interviews" | "tasks" | "contacts";

// Sequential requests keep existing validation and side effects without flooding the API.
export async function applyBulkChange(
    request: (path: string, init: RequestInit) => Promise<Response>,
    resource: BulkResource,
    entries: { id: string; label: string }[],
    change: BulkChange,
): Promise<BulkResult> {
    const failed: BulkResult["failed"] = [];
    let warning: string | undefined;
    for (const entry of entries) {
        const deleting = change.field === "delete";
        const suffix = resource === "applications" && !deleting ? "/status" : "";
        try {
            const response = await request(`/${resource}/${encodeURIComponent(entry.id)}${suffix}`, {
                method: deleting ? "DELETE" : "PATCH",
                ...("value" in change ? { body: JSON.stringify({ [change.field]: change.value }) } : {}),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) failed.push({ id: entry.id, message: `${entry.label}: ${data.message || "The change could not be saved."}` });
            if (data.notification?.needsAttention) warning = "Reminder scheduling needs attention. Check Settings → Notifications & reminders.";
        } catch {
            failed.push({ id: entry.id, message: `${entry.label}: Connection lost. Refresh to verify the result before retrying.` });
        }
    }
    return { failed, warning };
}
