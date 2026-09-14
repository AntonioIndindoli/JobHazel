"use client";

import Link from "next/link";
import { useState } from "react";
import { unsubscribeReminders } from "../lib/notification-api";

export default function UnsubscribePage() {
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [message, setMessage] = useState("");

    async function unsubscribe() {
        const token = new URLSearchParams(window.location.search).get("token");
        if (!token) { setMessage("This link is missing its unsubscribe token. Use the link in a reminder email."); return; }
        setBusy(true); setMessage("");
        try {
            setMessage(await unsubscribeReminders(token));
            setDone(true);
            window.history.replaceState({}, "", window.location.pathname);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Could not unsubscribe. Please try again.");
        } finally { setBusy(false); }
    }

    return <main className="notification-unsubscribe">
        <article className="account-settings-card notification-settings">
            <h1>{done ? "You’re unsubscribed" : "Unsubscribe from reminders"}</h1>
            <p>Turn off upcoming task, overdue task, and interview reminder emails from JobHazel. Account security emails will continue.</p>
            {!done && <button type="button" className="btn primary" disabled={busy} onClick={() => void unsubscribe()}>{busy ? "Unsubscribing…" : "Unsubscribe from all reminders"}</button>}
            {message && <p role={done ? "status" : "alert"} className={`account-feedback ${done ? "success" : "error"}`}>{message}</p>}
            <p>You can turn reminders back on in Settings at any time.</p>
            <Link href="/" referrerPolicy="no-referrer">Return to JobHazel</Link>
        </article>
    </main>;
}
