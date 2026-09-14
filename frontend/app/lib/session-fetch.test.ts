import { afterEach, expect, it, vi } from "vitest";
import { sessionFetch } from "./session-fetch";
afterEach(() => vi.unstubAllGlobals());
it("sends cookies and removes the UI marker from bearer authorization", async () => {
    const transport = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", transport);
    await sessionFetch("/applications", { headers: { Authorization: "Bearer cookie-session", "Content-Type": "application/json" } });
    const options = transport.mock.calls[0][1];
    expect(options.credentials).toBe("include");
    expect(options.headers.has("Authorization")).toBe(false);
    expect(options.headers.get("Content-Type")).toBe("application/json");
});
