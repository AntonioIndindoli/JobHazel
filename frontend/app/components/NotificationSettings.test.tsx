import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationSettings } from "./NotificationSettings";
import UnsubscribePage from "../unsubscribe/page";
import { requestNotificationPreferences, unsubscribeReminders } from "../lib/notification-api";

vi.mock("../lib/notification-api", () => ({ requestNotificationPreferences: vi.fn(), unsubscribeReminders: vi.fn() }));
const preferences = {
    emailEnabled: false, upcomingTasks: true, overdueTasks: true, interviewReminders: true,
    taskReminderDays: 1, interviewReminderMinutes: 60, timeZone: "UTC",
    quietHoursEnabled: false, quietHoursStart: "22:00", quietHoursEnd: "08:00",
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requestNotificationPreferences).mockResolvedValue({ ...preferences });
});

describe("NotificationSettings", () => {
    it("loads, edits and saves reminders with timezone and quiet hours", async () => {
        render(<NotificationSettings token="session-token" />);
        await screen.findByRole("switch", { name: /Email reminders/ });
        const user = userEvent.setup();
        await user.click(screen.getByRole("switch", { name: /Email reminders/ }));
        await user.click(screen.getByRole("switch", { name: /Quiet hours/ }));
        await user.clear(screen.getByLabelText("Time zone"));
        await user.type(screen.getByLabelText("Time zone"), "America/Los_Angeles");
        await user.click(screen.getByRole("button", { name: "Save notification preferences" }));
        await screen.findByText("Notification preferences saved.");
        expect(requestNotificationPreferences).toHaveBeenLastCalledWith("session-token", { ...preferences, emailEnabled: true, quietHoursEnabled: true, timeZone: "America/Los_Angeles" });
    });

    it("shows load failures with a working retry", async () => {
        vi.mocked(requestNotificationPreferences).mockRejectedValueOnce(new Error("Session expired"));
        render(<NotificationSettings token="token" />);
        expect((await screen.findByRole("alert")).textContent).toBe("Session expired");
        await userEvent.click(screen.getByRole("button", { name: "Retry" }));
        await screen.findByRole("switch", { name: /Email reminders/ });
    });

    it("preserves edits on save failure and can unsubscribe immediately", async () => {
        render(<NotificationSettings token="token" />);
        await screen.findByRole("switch", { name: /Email reminders/ });
        vi.mocked(requestNotificationPreferences).mockRejectedValueOnce(new Error("Could not save"));
        await userEvent.click(screen.getByRole("switch", { name: /Email reminders/ }));
        await userEvent.click(screen.getByRole("button", { name: "Save notification preferences" }));
        await screen.findByText("Could not save");
        expect((screen.getByRole("switch", { name: /Email reminders/ }) as HTMLInputElement).checked).toBe(true);
        await userEvent.click(screen.getByRole("button", { name: "Unsubscribe from all reminders" }));
        await screen.findByText("Unsubscribed from all reminder emails.");
        expect(requestNotificationPreferences).toHaveBeenLastCalledWith("token", { emailEnabled: false });
    });
});

describe("UnsubscribePage", () => {
    it("only unsubscribes after confirmation, without requiring a session", async () => {
        window.history.replaceState({}, "", "/unsubscribe?token=signed-token");
        vi.mocked(unsubscribeReminders).mockResolvedValue("You have unsubscribed.");
        render(<UnsubscribePage />);
        expect(unsubscribeReminders).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole("button", { name: "Unsubscribe from all reminders" }));
        await screen.findByText("You’re unsubscribed");
        expect(unsubscribeReminders).toHaveBeenCalledWith("signed-token");
        expect(window.location.search).toBe("");
    });

    it("reports missing tokens without sending a request", async () => {
        window.history.replaceState({}, "", "/unsubscribe");
        render(<UnsubscribePage />);
        await userEvent.click(screen.getByRole("button", { name: "Unsubscribe from all reminders" }));
        await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("missing"));
        expect(unsubscribeReminders).not.toHaveBeenCalled();
    });
});
