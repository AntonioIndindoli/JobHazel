import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApplicationStatusSelect } from "./ApplicationStatusSelect";

describe("ApplicationStatusSelect", () => {
    it("shows the selected status color class and reports changes", () => {
        const onChange = vi.fn();
        const { container, rerender } = render(
            <ApplicationStatusSelect value="APPLIED" onChange={onChange} />,
        );

        expect(
            container
                .querySelector(".application-status-select")
                ?.classList.contains("status-applied"),
        ).toBe(true);
        expect(container.querySelector(".application-status-dot")).not.toBeNull();

        fireEvent.change(screen.getByRole("combobox"), {
            target: { value: "OFFER" },
        });
        expect(onChange).toHaveBeenCalledWith("OFFER");

        rerender(<ApplicationStatusSelect value="OFFER" onChange={onChange} />);
        expect(
            container
                .querySelector(".application-status-select")
                ?.classList.contains("status-offer"),
        ).toBe(true);
    });
});
