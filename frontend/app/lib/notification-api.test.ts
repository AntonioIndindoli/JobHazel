import { afterEach, expect, it, vi } from "vitest";
import { requestNotificationPreferences, retryNotificationScheduling } from "./notification-api";

afterEach(() => vi.unstubAllGlobals());
it("keeps delivery status out of preference writes", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ preferences: { emailEnabled: false }, notification: { mode: "drain", needsAttention: true } })));
    vi.stubGlobal("fetch", fetch);
    const result = await requestNotificationPreferences("cookie-session", { emailEnabled: false, delivery: { mode: "drain", needsAttention: true } });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ emailEnabled: false });
    expect(result.delivery?.needsAttention).toBe(true);
});
it("surfaces retry rate limits", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Please wait" }), { status: 429 })));
    await expect(retryNotificationScheduling("cookie-session")).rejects.toThrow("Please wait");
});
