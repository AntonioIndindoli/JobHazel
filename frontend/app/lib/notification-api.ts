import { sessionFetch as fetch } from "./session-fetch";
import { API_BASE_URL } from "./constants";

export type NotificationDeliveryStatus = { mode: string; needsAttention: boolean; pending?: number; unknown?: number; failed?: number; capacityLimited?: boolean };

export type NotificationPreferences = {
    delivery?: NotificationDeliveryStatus;
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
        ...(update ? { body: JSON.stringify(Object.fromEntries(Object.entries(update).filter(([key]) => key !== "delivery"))) } : {}), signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "Could not load notification preferences.");
    return { ...data.preferences, delivery: data.notification };
}

export async function unsubscribeReminders(token: string): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/notifications/unsubscribe`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "Could not unsubscribe. Please try again.");
    return data.message;
}

export async function retryNotificationScheduling(token: string): Promise<NotificationDeliveryStatus> {
    const response = await fetch(`${API_BASE_URL}/notifications/retry`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "Could not retry reminders.");
    return data.notification;
}
