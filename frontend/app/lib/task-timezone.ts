"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { taskCalendarDay } from "./task-utils";
import { requestNotificationPreferences } from "./notification-api";

export const TaskTimeZoneContext = createContext<{ timeZone: string; now: number; setTimeZone: (value: string) => void }>({
    timeZone: "UTC",
    now: 0,
    setTimeZone: () => {},
});

export function useTaskTimeZone() {
    return useContext(TaskTimeZoneContext);
}

export function useTaskClock(token: string) {
    const [setting, setSetting] = useState({ token: "", timeZone: "UTC" });
    const [now, setNow] = useState(0);
    const timeZone = setting.token === token ? setting.timeZone : "UTC";
    useEffect(() => {
        const timer = window.setInterval(() => setNow(taskCalendarDay(new Date(), timeZone)), 1000);
        return () => window.clearInterval(timer);
    }, [timeZone]);
    useEffect(() => {
        if (!token) return;
        const controller = new AbortController();
        requestNotificationPreferences(token, undefined, controller.signal).then((value) => {
            if (!controller.signal.aborted) setSetting({ token, timeZone: value.timeZone });
        }).catch(() => { /* Match the API default until preferences can be loaded. */ });
        return () => controller.abort();
    }, [token]);
    return {
        timeZone,
        now,
        setTimeZone: (timeZone: string) => setSetting({ token, timeZone }),
    };
}
