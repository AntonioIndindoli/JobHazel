import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AuthPanel } from "./AuthPanel";

function renderAuthPanel(mode: "signup" | "login" = "login") {
    return render(
        <AuthPanel
            mode={mode}
            email="person@example.com"
            password="secret123"
            authStatus="signedOut"
            message=""
            onClose={vi.fn()}
            onModeChange={vi.fn()}
            onEmailChange={vi.fn()}
            onPasswordChange={vi.fn()}
            onSubmit={vi.fn()}
        />,
    );
}

describe("AuthPanel", () => {
    it.each(["login", "signup"] as const)("toggles password visibility in %s mode", async (mode) => {
        renderAuthPanel(mode);
        const password = screen.getByLabelText("Password") as HTMLInputElement;

        expect(password.type).toBe("password");
        await userEvent.click(screen.getByRole("button", { name: "Show password" }));
        expect(password.type).toBe("text");

        await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
        expect(password.type).toBe("password");
    });
});
