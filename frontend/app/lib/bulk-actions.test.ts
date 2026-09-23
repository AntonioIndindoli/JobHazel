import { describe, expect, it, vi } from "vitest";
import { applyBulkChange } from "./bulk-actions";

describe("applyBulkChange", () => {
    it("uses the status endpoint and continues after server and network failures", async () => {
        const request = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Invalid transition" }), { status: 400 }))
            .mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValueOnce(new Response(JSON.stringify({ notification: { needsAttention: true } })));
        const result = await applyBulkChange(request, "applications", ["a", "b", "c"].map(id => ({ id, label: id })), { field: "status", value: "APPLIED" });
        expect(request).toHaveBeenCalledTimes(3);
        expect(request).toHaveBeenLastCalledWith("/applications/c/status", { method: "PATCH", body: '{"status":"APPLIED"}' });
        expect(result.failed.map(item => item.id)).toEqual(["a", "b"]);
        expect(result.warning).toContain("Reminder scheduling");
    });

    it("accepts empty delete responses and sends no edit payload", async () => {
        const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
        expect(await applyBulkChange(request, "contacts", [{ id: "a", label: "Alpha" }], { field: "delete" })).toEqual({ failed: [], warning: undefined });
        expect(request).toHaveBeenCalledWith("/contacts/a", { method: "DELETE" });
    });
});
