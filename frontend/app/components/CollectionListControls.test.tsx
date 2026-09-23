import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CollectionListControls } from "./CollectionListControls";

function renderControls({ open = false, count = 0, active = false } = {}) {
    const onToggleFilters = vi.fn();
    const onReset = vi.fn();
    const onSortChange = vi.fn();
    render(<CollectionListControls
        noun="applications"
        search={<input aria-label="Search applications" />}
        filters={<select aria-label="Filter applications by status"><option>All statuses</option></select>}
        filtersOpen={open}
        onToggleFilters={onToggleFilters}
        activeFilterCount={count}
        hasActiveFilters={active}
        onReset={onReset}
        sortValue="dateApplied:desc"
        sortOptions={[{ value: "dateApplied:desc", label: "Applied date: newest first" }, { value: "title:asc", label: "Role: A to Z" }]}
        onSortChange={onSortChange}
    />);
    return { onToggleFilters, onReset, onSortChange };
}

describe("CollectionListControls", () => {
    it("starts with filters hidden and keeps sorting available", () => {
        const { onToggleFilters, onSortChange } = renderControls();
        expect(screen.queryByLabelText("Filter applications by status")).toBeNull();
        expect(screen.queryByRole("button", { name: "Reset filters" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Filters" }));
        expect(onToggleFilters).toHaveBeenCalledOnce();
        fireEvent.change(screen.getByLabelText("Sort applications"), { target: { value: "title:asc" } });
        expect(onSortChange).toHaveBeenCalledWith("title:asc");
    });

    it("shows reset only when a filter is active", () => {
        const { onReset } = renderControls({ open: true, count: 1, active: true });
        expect(screen.getByLabelText("Filter applications by status")).toBeTruthy();
        expect(screen.getByLabelText("1 active filters")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
        expect(onReset).toHaveBeenCalledOnce();
    });
});
