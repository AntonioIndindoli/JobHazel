import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BulkActions, BulkRow, useBulkSelection, type BulkHandler } from "./BulkActions";

const items = [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }];
function Harness({ scope = "all", entries = items, apply = vi.fn(), open = vi.fn() }: { scope?: string; entries?: typeof items; apply?: BulkHandler; open?: () => void }) {
    const selection = useBulkSelection(entries, scope);
    return <>
        <BulkActions selection={selection} count={entries.length} noun="contacts" fields={[{ key: "relationship", label: "Relationship", options: [{ value: "REFERRAL", label: "Referral" }] }]} onApply={apply} />
        {entries.map(item => <BulkRow key={item.id} selection={selection} id={item.id} label={item.label}><button onClick={open}>{item.label}</button></BulkRow>)}
    </>;
}

describe("bulk selection", () => {
    it("keeps row navigation separate and indicates partial selection", () => {
        const open = vi.fn();
        render(<Harness open={open} />);
        fireEvent.click(screen.getByLabelText("Select Alpha"));
        expect(open).not.toHaveBeenCalled();
        expect((screen.getByLabelText("Select all") as HTMLInputElement).indeterminate).toBe(true);
        fireEvent.click(screen.getByText("Alpha", { selector: "button" }));
        expect(open).toHaveBeenCalledOnce();
        fireEvent.click(screen.getByLabelText("Select all"));
        expect(screen.getByText("2 selected")).toBeTruthy();
    });

    it("clears selection on filter changes and only selects matching entries", () => {
        const { rerender } = render(<Harness />);
        fireEvent.click(screen.getByLabelText("Select all"));
        rerender(<Harness scope="filtered" entries={[items[1]]} />);
        expect(screen.queryByText("2 selected")).toBeNull();
        expect((screen.getByLabelText("Select Beta") as HTMLInputElement).checked).toBe(false);
        fireEvent.click(screen.getByLabelText("Select all"));
        expect(screen.getByText("1 selected")).toBeTruthy();
    });

    it("sends only the edited field and retains failed entries for retry", async () => {
        const apply = vi.fn().mockResolvedValue({ failed: [{ id: "b", message: "Beta: Could not save" }] });
        render(<Harness apply={apply} />);
        fireEvent.click(screen.getByLabelText("Select all"));
        fireEvent.click(screen.getByRole("button", { name: "Edit selected" }));
        fireEvent.change(screen.getByLabelText("New relationship"), { target: { value: "REFERRAL" } });
        fireEvent.click(screen.getByRole("button", { name: "Update 2 contacts" }));
        await waitFor(() => expect(screen.getByRole("status").textContent).toContain("1 of 2 contacts updated"));
        expect(apply).toHaveBeenCalledWith(["a", "b"], { field: "relationship", value: "REFERRAL" });
        expect((screen.getByLabelText("Select Alpha") as HTMLInputElement).checked).toBe(false);
        expect((screen.getByLabelText("Select Beta") as HTMLInputElement).checked).toBe(true);
    });

    it("requires confirmation for deletion and prevents duplicate submissions", async () => {
        let finish!: (result: { failed: [] }) => void;
        const apply = vi.fn(() => new Promise<{ failed: [] }>(resolve => { finish = resolve; }));
        render(<Harness apply={apply} />);
        fireEvent.click(screen.getByLabelText("Select Alpha"));
        fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
        expect(apply).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(apply).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
        fireEvent.click(screen.getByRole("button", { name: "Delete 1 contact" }));
        expect((screen.getByLabelText("Select Alpha") as HTMLInputElement).disabled).toBe(true);
        fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
        expect(apply).toHaveBeenCalledOnce();
        finish({ failed: [] });
        await waitFor(() => expect(screen.getByRole("status").textContent).toContain("1 of 1 contact deleted"));
    });
});

