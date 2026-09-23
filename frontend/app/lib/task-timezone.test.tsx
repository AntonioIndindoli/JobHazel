import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { requestNotificationPreferences, type NotificationPreferences } from "./notification-api";
import { useTaskClock } from "./task-timezone";
vi.mock("./notification-api", () => ({ requestNotificationPreferences: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

it("loads the saved zone, applies changes, and resets when signing out", async () => {
    vi.mocked(requestNotificationPreferences).mockResolvedValue({ timeZone: "Asia/Kathmandu" } as NotificationPreferences);
    const { result, rerender } = renderHook(({ token }) => useTaskClock(token), { initialProps: { token: "user" } });
    await waitFor(() => expect(result.current.timeZone).toBe("Asia/Kathmandu"));
    act(() => result.current.setTimeZone("America/Los_Angeles"));
    expect(result.current.timeZone).toBe("America/Los_Angeles");
    rerender({ token: "" });
    expect(result.current.timeZone).toBe("UTC");
});

it("refreshes the calendar when midnight passes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-18T23:59:58Z"));
    const { result } = renderHook(() => useTaskClock(""));
    act(() => vi.advanceTimersByTime(1000));
    const day = result.current.now;
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.now).toBe(day + 1);
});
