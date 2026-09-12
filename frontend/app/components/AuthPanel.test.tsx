import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AuthPanel } from "./AuthPanel";
import type { Mode } from "../lib/types";

function renderAuthPanel(mode: Mode = "login", overrides: { message?: string; messageTone?: "error" | "success" | "info" } = {}) {
    return render(
        <AuthPanel
            mode={mode}
            email="person@example.com"
            password="secret123"
            authStatus="signedOut"
            message={overrides.message ?? ""}
            messageTone={overrides.messageTone}
            onClose={vi.fn()}
            onModeChange={vi.fn()}
            onEmailChange={vi.fn()}
            onPasswordChange={vi.fn()}
            onSubmit={vi.fn()}
            onResendVerification={vi.fn()}
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

    it("shows a dedicated verification state after signup", () => {
        renderAuthPanel("verify");

        expect(screen.getByRole("heading", { name: "Check your inbox" })).toBeTruthy();
        expect(screen.getByText("person@example.com")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Resend verification email" })).toBeTruthy();
        expect(screen.queryByLabelText("Password")).toBeNull();
    });

    it("styles successful password reset feedback as success", () => {
        renderAuthPanel("login", { message: "Password reset. You can now sign in.", messageTone: "success" });
        expect(screen.getByRole("status").className).toContain("success");
    });
});
