import { sessionFetch as fetch } from "./session-fetch";
import { API_BASE_URL } from "./constants";

export type NotificationPreferences = {
    emailEnabled: boolean;
    upcomingTasks: boolean;
    overdueTasks: boolean;
    interviewReminders: boolean;
    taskReminderDays: number;
    interviewReminderMinutes: number;
    timeZone: string;
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
};

export async function requestNotificationPreferences(token: string, update?: Partial<NotificationPreferences>, signal?: AbortSignal): Promise<NotificationPreferences> {
    const response = await fetch(`${API_BASE_URL}/notifications/preferences`, {
        method: update ? "PATCH" : "GET",
        headers: { Authorization: `Bearer ${token}`, ...(update ? { "Content-Type": "application/json" } : {}) },
        ...(update ? { body: JSON.stringify(update) } : {}), signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "Could not load notification preferences.");
    return data.preferences;
}

export async function unsubscribeReminders(token: string): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/notifications/unsubscribe`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "Could not unsubscribe. Please try again.");
    return data.message;
}
