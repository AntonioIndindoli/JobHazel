"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTaskTimeZone } from "../lib/task-timezone";
import { AppIcon } from "./AppIcon";
import { requestNotificationPreferences, retryNotificationScheduling, type NotificationPreferences } from "../lib/notification-api";

export function NotificationSettings({ token }: { token: string }) {
    const { setTimeZone } = useTaskTimeZone();
    const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [reload, setReload] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        requestNotificationPreferences(token, undefined, controller.signal).then((value) => {
            if (!controller.signal.aborted) { setPreferences(value); setError(""); }
        }).catch((reason: Error) => {
            if (!controller.signal.aborted) setError(reason.message || "Could not load notification preferences.");
        });
        return () => controller.abort();
    }, [token, reload]);

    function change<K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) {
        setPreferences((current) => current ? { ...current, [key]: value } : current);
        setMessage("");
        setError("");
    }

    async function save(event?: FormEvent, unsubscribe = false) {
        event?.preventDefault();
        if (!preferences) return;
        if (!unsubscribe && preferences.quietHoursEnabled && preferences.quietHoursStart === preferences.quietHoursEnd) {
            setError("Quiet hours must have different start and end times.");
            return;
        }
        setBusy(true); setError(""); setMessage("");
        try {
            const saved = await requestNotificationPreferences(token, unsubscribe ? { emailEnabled: false } : preferences);
            setPreferences(saved);
            setTimeZone(saved.timeZone);
            setMessage(saved.delivery?.needsAttention ? (unsubscribe ? "Emails disabled. Cancellation is pending; an already-scheduled email may still arrive." : "Preferences saved. Reminder scheduling needs attention.") : unsubscribe ? "Unsubscribed from all reminder emails." : "Notification preferences saved.");
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Could not save notification preferences.");
        } finally { setBusy(false); }
    }

    function toggle(key: "emailEnabled" | "upcomingTasks" | "overdueTasks" | "interviewReminders" | "quietHoursEnabled", label: string, description: string) {
        if (!preferences) return null;
        return <label className="automation-setting-row notification-toggle">
            <span className="automation-setting-copy"><strong>{label}</strong><small>{description}</small></span>
            <span className="notification-switch">
                <input type="checkbox" role="switch" checked={preferences[key]} onChange={(event) => change(key, event.target.checked)} />
                <span className="account-switch-track" aria-hidden="true"><span /></span>
            </span>
        </label>;
    }

    return <article className="account-settings-card settings-card notification-settings">
        <div className="account-section-heading">
            <span><AppIcon name="bell" size={19} /></span>
            <div><h2>Notifications &amp; reminders</h2><p>Choose which emails help you stay on track. Reminders require a verified email address.</p></div>
        </div>
        {!preferences ? <>
            {!error && <p role="status">Loading notification preferences…</p>}
            {error && <><p role="alert" className="account-feedback error">{error}</p><button type="button" className="btn secondary" onClick={() => setReload((value) => value + 1)}>Retry</button></>}
        </> : <form onSubmit={(event) => void save(event)}>
            <fieldset disabled={busy} className="notification-fieldset">
                {toggle("emailEnabled", "Email reminders", "Turn on task summaries and interview reminders.")}
                {toggle("upcomingTasks", "Upcoming tasks", preferences.delivery?.mode === "daily-digest-scheduled-interviews" ? "Include tasks due today and upcoming tasks in your daily summary." : "One reminder per due date, checked daily.")}
                {toggle("overdueTasks", "Overdue tasks", preferences.delivery?.mode === "daily-digest-scheduled-interviews" ? "Include open overdue tasks in each daily summary until completed." : "One email after a task’s due day has passed.")}
                {toggle("interviewReminders", "Interview reminders", "One reminder before each scheduled interview.")}
                <div className="notification-fields">
                    <label>Upcoming task range (days)<input type="number" min="0" max="7" required value={Number.isNaN(preferences.taskReminderDays) ? "" : preferences.taskReminderDays} onChange={(event) => change("taskReminderDays", event.target.valueAsNumber)} /></label>
                    <label>Interview reminder lead time (minutes)<input type="number" min="5" max="10080" required value={Number.isNaN(preferences.interviewReminderMinutes) ? "" : preferences.interviewReminderMinutes} onChange={(event) => change("interviewReminderMinutes", event.target.valueAsNumber)} /></label>
                    <label className="notification-timezone">Time zone<input type="text" aria-label="Time zone" aria-describedby="notification-timezone-help" required maxLength={100} value={preferences.timeZone} placeholder="America/Los_Angeles" onChange={(event) => change("timeZone", event.target.value)} /><small id="notification-timezone-help">Use a time zone such as America/Los_Angeles or Europe/London.</small></label>
                </div>
                <button type="button" className="btn secondary" onClick={() => change("timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone)}>Use device time zone</button>
                {toggle("quietHoursEnabled", "Quiet hours", "Hold emails until quiet hours end. Interviews that have already started are skipped.")}
                <div className="notification-fields">
                    <label>Quiet hours start<input type="time" required disabled={!preferences.quietHoursEnabled} value={preferences.quietHoursStart} onChange={(event) => change("quietHoursStart", event.target.value)} /></label>
                    <label>Quiet hours end<input type="time" required disabled={!preferences.quietHoursEnabled} value={preferences.quietHoursEnd} onChange={(event) => change("quietHoursEnd", event.target.value)} /></label>
                </div>
                <p className="automation-delay-help">{preferences.delivery?.mode === "daily-digest-scheduled-interviews" ? "Task summaries are prepared daily at 15:07 UTC and show a snapshot of your tasks. Quiet hours defer the summary until they end, or skip it if it would reach the next daily run. Interview emails are scheduled ahead of time. Times and due days use your selected time zone, including daylight saving time." : preferences.delivery?.mode === "drain" ? "New reminder delivery is paused while existing scheduled emails are reconciled." : "Delivery is checked once daily. Short interview reminder windows may be missed. Times and due days use your selected time zone."}</p>
                {preferences.delivery?.needsAttention && <p role="status">{preferences.delivery.capacityLimited ? "Reminder delivery is awaiting rollout capacity. Your preferences are saved." : "Some reminder operations need attention. A scheduled email may still arrive while cancellation is pending."}</p>}
                <div className="notification-actions">
                    {preferences.delivery?.mode && preferences.delivery.mode !== "legacy" && <button type="button" className="btn secondary" onClick={async () => {
                        setBusy(true); setError("");
                        try {
                            const delivery = await retryNotificationScheduling(token);
                            setPreferences((current) => current ? { ...current, delivery } : current);
                            setMessage(delivery.needsAttention ? "Some reminders still need attention. Pending work is retained for reconciliation." : "Reminder scheduling is up to date.");
                        } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not retry reminders."); }
                        finally { setBusy(false); }
                    }}>Retry reminder scheduling</button>}
                    <button type="submit" className="btn primary">{busy ? "Saving…" : "Save notification preferences"}</button>
                    <button type="button" className="btn secondary" onClick={() => void save(undefined, true)}>Unsubscribe from all reminders</button>
                </div>
            </fieldset>
            {error && <p role="alert" className="account-feedback error">{error}</p>}
            {message && <p role="status" className="account-feedback success">{message}</p>}
        </form>}
    </article>;
}
